"use strict";

const { getTravelEstimateForStaff } = require("../staff-travel-estimates");

function createAdminOrderDomain(deps = {}) {
  const {
    ADMIN_ORDERS_PATH,
    ORDER_ASSIGNMENT_VALUES,
    SITE_ORIGIN,
    formatAdminScheduleLabel,
    getEntryAdminOrderData,
    getEntryCalculatorData,
    getEntryOrderPolicyAcceptanceData,
    getEntryPaymentData,
    getRequestUrl,
    normalizeAdminOrderDateInput,
    normalizeAdminOrderTimeInput,
    normalizeString,
    toAdminScheduleTimestamp,
  } = deps;

  function buildStaffPlanningContext(entries = [], staffSnapshot = {}) {
    const orderEntries = Array.isArray(entries) ? entries.filter((entry) => isOrderCreatedEntry(entry)) : [];
    const staff = Array.isArray(staffSnapshot.staff) ? staffSnapshot.staff.slice() : [];
    const assignments = Array.isArray(staffSnapshot.assignments) ? staffSnapshot.assignments.slice() : [];
    const staffById = new Map(staff.map((record) => [record.id, record]));
    const assignmentsByEntryId = new Map(assignments.map((record) => [record.entryId, record]));
    const orderItems = orderEntries
      .map((entry) => {
        const assignment = assignmentsByEntryId.get(entry.id) || null;
        const assignedStaff = assignment
          ? assignment.staffIds.map((staffId) => staffById.get(staffId)).filter(Boolean)
          : [];
        const missingStaffIds = assignment ? assignment.staffIds.filter((staffId) => !staffById.has(staffId)) : [];
        const fallbackScheduleDate = getOrderSelectedDate(entry);
        const fallbackScheduleTime = getOrderSelectedTime(entry);
        const scheduleDate = normalizeString((assignment && assignment.scheduleDate) || fallbackScheduleDate, 32);
        const scheduleTime = normalizeString((assignment && assignment.scheduleTime) || fallbackScheduleTime, 32);
        return {
          entry,
          assignment,
          assignedStaff,
          missingStaffIds,
          scheduleDate,
          scheduleTime,
          hasSchedule: Boolean(scheduleDate || scheduleTime),
          scheduleTimestamp: toAdminScheduleTimestamp(scheduleDate, scheduleTime),
          scheduleLabel: formatAdminScheduleLabel(scheduleDate, scheduleTime),
          assignmentStatus: assignment ? assignment.status : "planned",
        };
      })
      .sort((left, right) => {
        const leftHasTimestamp = Number.isFinite(left.scheduleTimestamp);
        const rightHasTimestamp = Number.isFinite(right.scheduleTimestamp);
        if (leftHasTimestamp && rightHasTimestamp && left.scheduleTimestamp !== right.scheduleTimestamp) {
          return left.scheduleTimestamp - right.scheduleTimestamp;
        }
        if (left.hasSchedule !== right.hasSchedule) {
          return left.hasSchedule ? -1 : 1;
        }
        const leftCreatedAt = Date.parse(left.entry.createdAt || "");
        const rightCreatedAt = Date.parse(right.entry.createdAt || "");
        return (Number.isFinite(rightCreatedAt) ? rightCreatedAt : 0) - (Number.isFinite(leftCreatedAt) ? leftCreatedAt : 0);
      });
    const plannedOrderItems = attachStaffTravelPlanning(orderItems);

    const now = Date.now();
    const weekAhead = now + 7 * 24 * 60 * 60 * 1000;
    const orderItemsByEntryId = new Map(plannedOrderItems.map((item) => [item.entry.id, item]));
    const staffSummaries = staff.map((record) => {
      const assignedOrders = plannedOrderItems.filter((item) =>
        item.assignedStaff.some((staffRecord) => staffRecord.id === record.id)
      );
      const scheduledOrders = assignedOrders.filter((item) => item.hasSchedule);
      const datedOrders = scheduledOrders.filter((item) => Number.isFinite(item.scheduleTimestamp));
      const nextOrder = datedOrders.length > 0 ? datedOrders[0] : scheduledOrders[0] || null;
      const upcomingWeekCount = datedOrders.filter(
        (item) => item.scheduleTimestamp >= now && item.scheduleTimestamp <= weekAhead
      ).length;
      return {
        ...record,
        assignedOrders,
        scheduledOrders,
        assignedCount: assignedOrders.length,
        scheduledCount: scheduledOrders.length,
        upcomingWeekCount,
        nextOrder,
      };
    });

    const scheduledOrders = plannedOrderItems.filter((item) => item.hasSchedule);
    const assignedScheduledCount = scheduledOrders.filter((item) => item.assignedStaff.length > 0).length;
    const unassignedScheduledCount = scheduledOrders.filter((item) => item.assignedStaff.length === 0).length;

    return {
      staff,
      assignments,
      staffById,
      assignmentsByEntryId,
      orderItems: plannedOrderItems,
      orderItemsByEntryId,
      staffSummaries,
      scheduledOrders,
      assignedScheduledCount,
      unassignedScheduledCount,
      activeStaffCount: staff.filter((record) => record.status === "active").length,
    };
  }

  function attachStaffTravelPlanning(orderItems = []) {
    const normalizedItems = Array.isArray(orderItems) ? orderItems.map((item) => ({ ...item, travelLegs: [] })) : [];
    const bucketByStaffAndDay = new Map();

    for (const item of normalizedItems) {
      if (!item || !item.entry || !Array.isArray(item.assignedStaff) || item.assignedStaff.length === 0) continue;
      if (!item.hasSchedule || !Number.isFinite(item.scheduleTimestamp)) continue;
      const scheduleDate = normalizeString(item.scheduleDate, 32);
      if (!scheduleDate) continue;

      for (const staffRecord of item.assignedStaff) {
        if (!staffRecord || !staffRecord.id) continue;
        const key = `${staffRecord.id}::${scheduleDate}`;
        const bucket = bucketByStaffAndDay.get(key) || [];
        bucket.push({ item, staffRecord });
        bucketByStaffAndDay.set(key, bucket);
      }
    }

    for (const bucket of bucketByStaffAndDay.values()) {
      bucket.sort((left, right) => compareStaffTravelItems(left.item, right.item));
      let previousItem = null;

      for (const bucketItem of bucket) {
        const leg = buildStaffTravelLeg(bucketItem.staffRecord, bucketItem.item, previousItem);
        bucketItem.item.travelLegs.push(leg);
        previousItem = bucketItem.item;
      }
    }

    for (const item of normalizedItems) {
      item.travelLegs.sort((left, right) =>
        normalizeString(left && left.staffName, 120).localeCompare(
          normalizeString(right && right.staffName, 120),
          "ru"
        )
      );
    }

    return normalizedItems;
  }

  function compareStaffTravelItems(left, right) {
    const leftHasTimestamp = Number.isFinite(left && left.scheduleTimestamp);
    const rightHasTimestamp = Number.isFinite(right && right.scheduleTimestamp);
    if (leftHasTimestamp && rightHasTimestamp && left.scheduleTimestamp !== right.scheduleTimestamp) {
      return left.scheduleTimestamp - right.scheduleTimestamp;
    }
    const leftCreatedAt = Date.parse((left && left.entry && left.entry.createdAt) || "");
    const rightCreatedAt = Date.parse((right && right.entry && right.entry.createdAt) || "");
    return (Number.isFinite(leftCreatedAt) ? leftCreatedAt : 0) - (Number.isFinite(rightCreatedAt) ? rightCreatedAt : 0);
  }

  function buildStaffTravelLeg(staffRecord, item, previousItem) {
    void previousItem;
    const staffName = normalizeString(staffRecord && staffRecord.name, 120) || "Сотрудник";
    const homeAddress = normalizeString(staffRecord && staffRecord.address, 500);
    const destinationAddress = normalizeString(item && item.entry && item.entry.fullAddress, 500);

    const originAddress = homeAddress;
    const sourceType = "home";
    const sourceLabel = "Из дома";
    const sourceTitle = staffName;

    const sameAddress =
      originAddress &&
      destinationAddress &&
      originAddress.toLowerCase() === destinationAddress.toLowerCase();
    const status = !destinationAddress
      ? "missing-destination"
      : !originAddress
        ? "missing-origin"
        : sameAddress
          ? "same-place"
          : "ready";
    const staffId = normalizeString(staffRecord && staffRecord.id, 120);
    const travelEstimate = getTravelEstimateForStaff(
      item && item.assignment ? item.assignment.travelEstimates : [],
      staffId
    );

    return {
      staffId,
      staffName,
      originAddress,
      destinationAddress,
      sourceType,
      sourceLabel,
      sourceTitle,
      departureTimestamp: Number.isFinite(item && item.scheduleTimestamp) ? item.scheduleTimestamp : 0,
      destinationLabel: normalizeString(item && item.scheduleLabel, 120),
      status,
      travelEstimate,
    };
  }

  function normalizeOrderServiceType(value, fallback = "standard") {
    const normalized = normalizeString(value, 40)
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/_/g, "-");
    if (!normalized) return fallback;
    if (normalized === "deep") return "deep";
    if (
      normalized === "moving" ||
      normalized === "move-in/out" ||
      normalized === "move-in-out" ||
      normalized === "moveout" ||
      normalized === "moveinout"
    ) {
      return "move-in/out";
    }
    if (normalized === "regular" || normalized === "standard") return "standard";
    return fallback;
  }

  function formatOrderServiceTypeLabel(value) {
    const normalized = normalizeOrderServiceType(value);
    if (normalized === "deep") return "Deep";
    if (normalized === "move-in/out") return "Move-in/out";
    return "Standard";
  }

  function normalizeOrderFrequency(value, fallback = "") {
    const normalized = normalizeString(value, 40)
      .toLowerCase()
      .replace(/[\s_-]+/g, "");
    if (!normalized) return fallback;
    if (normalized === "weekly") return "weekly";
    if (normalized === "monthly") return "monthly";
    if (normalized === "biweekly") return "biweekly";
    return fallback;
  }

  function formatOrderFrequencyLabel(value) {
    const normalized = normalizeOrderFrequency(value, "");
    if (normalized === "weekly") return "Weekly";
    if (normalized === "monthly") return "Monthly";
    if (normalized === "biweekly") return "Bi-weekly";
    return "Not set";
  }

  function normalizeOrderPaymentStatus(value, fallback = "unpaid") {
    const normalized = normalizeString(value, 40).toLowerCase().replace(/[\s_-]+/g, "");
    if (!normalized) return fallback;
    if (normalized === "paid") return "paid";
    if (normalized === "partial") return "partial";
    if (normalized === "unpaid") return "unpaid";
    return fallback;
  }

  function formatOrderPaymentStatusLabel(value) {
    const normalized = normalizeOrderPaymentStatus(value, "unpaid");
    if (normalized === "paid") return "Paid";
    if (normalized === "partial") return "Partial";
    return "Unpaid";
  }

  function normalizeOrderPaymentMethod(value, fallback = "") {
    const normalized = normalizeString(value, 40).toLowerCase().replace(/[\s_-]+/g, "");
    if (!normalized) return fallback;
    if (normalized === "cash") return "cash";
    if (normalized === "zelle") return "zelle";
    if (normalized === "card") return "card";
    if (normalized === "invoice") return "invoice";
    return fallback;
  }

  function formatOrderPaymentMethodLabel(value) {
    const normalized = normalizeOrderPaymentMethod(value, "");
    if (normalized === "cash") return "Cash";
    if (normalized === "zelle") return "Zelle";
    if (normalized === "card") return "Card";
    if (normalized === "invoice") return "Invoice";
    return "Not set";
  }

  function normalizeOrderStatus(value, fallback = "") {
    const normalized = normalizeString(value, 40).toLowerCase();
    const compact = normalized.replace(/[\s_-]+/g, "");
    if (!compact) return fallback;
    if (compact === "new") return "new";
    if (compact === "scheduled") return "scheduled";
    if (compact === "inprogress" || compact === "enroute") return "en-route";
    if (compact === "cleaningstarted" || compact === "startcleaning") return "cleaning-started";
    if (compact === "checklist") return "checklist";
    if (compact === "photo" || compact === "photos") return "photos";
    if (compact === "cleaningcomplete" || compact === "cleaningcompleted") return "cleaning-complete";
    if (compact === "invoicesent") return "invoice-sent";
    if (compact === "paid") return "paid";
    if (compact === "awaitingreview" || compact === "waitingreview") return "awaiting-review";
    if (compact === "completed") return "completed";
    if (compact === "canceled" || compact === "cancelled") return "canceled";
    if (compact === "rescheduled") return "rescheduled";
    return fallback;
  }

  function formatOrderStatusLabel(value) {
    const normalized = normalizeOrderStatus(value, "new");
    if (normalized === "scheduled") return "Запланировано";
    if (normalized === "en-route") return "В пути";
    if (normalized === "cleaning-started") return "Начать уборку";
    if (normalized === "checklist") return "Чеклист";
    if (normalized === "photos") return "Фото";
    if (normalized === "cleaning-complete") return "Уборка завершена";
    if (normalized === "invoice-sent") return "Инвойс отправлен";
    if (normalized === "paid") return "Оплачено";
    if (normalized === "awaiting-review") return "Ждем отзыв";
    if (normalized === "completed") return "Завершено";
    if (normalized === "canceled") return "Отменено";
    if (normalized === "rescheduled") return "Перенесено";
    return "Новые";
  }

  function getOrderSelectedDate(entry = {}) {
    const calculatorData = getEntryCalculatorData(entry);
    return normalizeString(entry.selectedDate || calculatorData.selectedDate, 32);
  }

  function getOrderSelectedTime(entry = {}) {
    const calculatorData = getEntryCalculatorData(entry);
    return normalizeString(entry.selectedTime || calculatorData.selectedTime, 32);
  }

  function getOrderServiceType(entry = {}) {
    const calculatorData = getEntryCalculatorData(entry);
    return normalizeOrderServiceType(entry.serviceType || calculatorData.serviceType);
  }

  function getOrderFrequency(entry = {}) {
    const calculatorData = getEntryCalculatorData(entry);
    const adminOrder = getEntryAdminOrderData(entry);
    return normalizeOrderFrequency(adminOrder.frequency || calculatorData.frequency, "");
  }

  function getOrderAssignedStaff(entry = {}) {
    const adminOrder = getEntryAdminOrderData(entry);
    return normalizeString(adminOrder.assignedStaff || adminOrder.assignee, 500);
  }

  function getOrderPaymentStatus(entry = {}) {
    const adminOrder = getEntryAdminOrderData(entry);
    const payment = getEntryPaymentData(entry);
    return normalizeOrderPaymentStatus(adminOrder.paymentStatus || payment.status, "unpaid");
  }

  function getOrderPaymentMethod(entry = {}) {
    const adminOrder = getEntryAdminOrderData(entry);
    const payment = getEntryPaymentData(entry);
    return normalizeOrderPaymentMethod(adminOrder.paymentMethod || payment.method, "");
  }

  function isOrderCreatedEntry(entry = {}) {
    const adminOrder = getEntryAdminOrderData(entry);
    if (!adminOrder || typeof adminOrder !== "object") return false;
    if (adminOrder.isCreated === true) return true;
    if (normalizeString(adminOrder.createdAt, 80)) return true;
    if (normalizeOrderStatus(adminOrder.status, "")) return true;
    if (normalizeString(adminOrder.assignedStaff || adminOrder.assignee, 500)) return true;
    if (normalizeString(adminOrder.selectedDate, 32) || normalizeString(adminOrder.selectedTime, 32)) return true;
    if (normalizeOrderFrequency(adminOrder.frequency, "")) return true;
    if (normalizeOrderPaymentMethod(adminOrder.paymentMethod, "")) return true;
    const completion =
      adminOrder.completion && typeof adminOrder.completion === "object" ? adminOrder.completion : null;
    if (
      completion &&
      (normalizeString(completion.cleanerComment, 4000) ||
        (Array.isArray(completion.beforePhotos) && completion.beforePhotos.length > 0) ||
        (Array.isArray(completion.afterPhotos) && completion.afterPhotos.length > 0))
    ) {
      return true;
    }
    return false;
  }

  function getOrderStatus(entry = {}) {
    if (!isOrderCreatedEntry(entry)) return "new";
    const adminOrder = getEntryAdminOrderData(entry);
    const explicitStatus = normalizeOrderStatus(adminOrder.status, "");
    if (explicitStatus) return explicitStatus;
    if (getOrderSelectedDate(entry) || getOrderSelectedTime(entry)) return "scheduled";
    return "new";
  }

  function formatOrderScheduleLabel(selectedDate, selectedTime) {
    const normalizedDate = normalizeString(selectedDate, 32);
    const normalizedTime = normalizeString(selectedTime, 32);
    if (!normalizedDate && !normalizedTime) return "Не указаны";
    return formatAdminScheduleLabel(normalizedDate, normalizedTime);
  }

  function getOrderSearchHaystack(order) {
    return [
      order.customerName,
      order.customerPhone,
      order.customerEmail,
      order.requestId,
      order.fullAddress,
      order.assignedStaff,
      order.paymentStatusLabel,
      order.paymentMethodLabel,
      order.serviceLabel,
      order.frequencyLabel,
      order.orderStatusLabel,
    ]
      .join(" ")
      .toLowerCase();
  }

  function collectAdminOrderRecords(entries = []) {
    return entries
      .filter((entry) => isOrderCreatedEntry(entry))
      .map((entry) => {
        const serviceType = getOrderServiceType(entry);
        const selectedDate = getOrderSelectedDate(entry);
        const selectedTime = getOrderSelectedTime(entry);
        const frequency = getOrderFrequency(entry);
        const assignedStaff = getOrderAssignedStaff(entry);
        const orderStatus = getOrderStatus(entry);
        const paymentStatus = getOrderPaymentStatus(entry);
        const paymentMethod = getOrderPaymentMethod(entry);
        const policyAcceptance = getEntryOrderPolicyAcceptanceData(entry);

        return {
          entry,
          id: normalizeString(entry.id, 120),
          customerName: normalizeString(entry.customerName || "Клиент", 250),
          customerPhone: normalizeString(entry.customerPhone, 80),
          customerEmail: normalizeString(entry.customerEmail, 250),
          requestId: normalizeString(entry.requestId, 120),
          fullAddress: normalizeString(entry.fullAddress, 500),
          createdAt: normalizeString(entry.createdAt, 80),
          serviceType,
          serviceLabel: formatOrderServiceTypeLabel(serviceType),
          frequency,
          frequencyLabel: formatOrderFrequencyLabel(frequency),
          orderStatus,
          orderStatusLabel: formatOrderStatusLabel(orderStatus),
          paymentStatus,
          paymentStatusLabel: formatOrderPaymentStatusLabel(paymentStatus),
          paymentMethod,
          paymentMethodLabel: formatOrderPaymentMethodLabel(paymentMethod),
          assignedStaff,
          selectedDate,
          selectedTime,
          scheduleLabel: formatOrderScheduleLabel(selectedDate, selectedTime),
          hasSchedule: Boolean(selectedDate || selectedTime),
          totalPrice: Number(entry.totalPrice || 0),
          crmStatus: normalizeString(entry.status, 32),
          needsAttention: normalizeString(entry.status, 32) !== "success",
          isAssigned: Boolean(assignedStaff),
          isRecurring: Boolean(frequency),
          policyAcceptance,
          policyAccepted: Boolean(policyAcceptance.policyAccepted),
        };
      });
  }

  function filterAdminOrderRecords(orderRecords = [], filters = {}) {
    const status = normalizeString(filters.status, 40).toLowerCase();
    const serviceType = normalizeString(filters.serviceType, 40).toLowerCase();
    const frequency = normalizeString(filters.frequency, 40).toLowerCase();
    const assignment = normalizeString(filters.assignment, 40).toLowerCase();
    const query = normalizeString(filters.q, 200).toLowerCase();

    return orderRecords.filter((order) => {
      if (status && status !== "all" && order.orderStatus !== normalizeOrderStatus(status, "")) return false;
      if (serviceType && serviceType !== "all" && order.serviceType !== normalizeOrderServiceType(serviceType, "")) {
        return false;
      }
      if (frequency && frequency !== "all" && order.frequency !== normalizeOrderFrequency(frequency, "")) return false;
      if (assignment === "assigned" && !order.isAssigned) return false;
      if (assignment === "unassigned" && order.isAssigned) return false;
      if (query && !getOrderSearchHaystack(order).includes(query)) return false;
      return true;
    });
  }

  function countOrdersByStatus(orderRecords = []) {
    const counts = {
      new: 0,
      scheduled: 0,
      "en-route": 0,
      "cleaning-started": 0,
      checklist: 0,
      photos: 0,
      "cleaning-complete": 0,
      "invoice-sent": 0,
      paid: 0,
      "awaiting-review": 0,
      completed: 0,
      canceled: 0,
      rescheduled: 0,
    };

    for (const order of orderRecords) {
      if (Object.prototype.hasOwnProperty.call(counts, order.orderStatus)) {
        counts[order.orderStatus] += 1;
      }
    }

    return counts;
  }

  function getOrdersFilters(req) {
    const reqUrl = getRequestUrl(req);
    const rawStatus = normalizeString(reqUrl.searchParams.get("status"), 40).toLowerCase();
    const rawServiceType = normalizeString(reqUrl.searchParams.get("serviceType"), 40).toLowerCase();
    const rawFrequency = normalizeString(reqUrl.searchParams.get("frequency"), 40).toLowerCase();
    const rawAssignment = normalizeString(reqUrl.searchParams.get("assignment"), 40).toLowerCase();
    const q = normalizeString(reqUrl.searchParams.get("q"), 200);

    return {
      reqUrl,
      filters: {
        status: rawStatus === "all" ? "all" : normalizeOrderStatus(rawStatus, "") || "all",
        serviceType: rawServiceType === "all" ? "all" : normalizeOrderServiceType(rawServiceType, "") || "all",
        frequency: rawFrequency === "all" ? "all" : normalizeOrderFrequency(rawFrequency, "") || "all",
        assignment: ORDER_ASSIGNMENT_VALUES.has(rawAssignment) ? rawAssignment : "all",
        q,
      },
    };
  }

  function buildOrdersReturnPath(value) {
    const candidate = normalizeString(value, 1000);
    if (!candidate) return ADMIN_ORDERS_PATH;

    try {
      const parsed = new URL(candidate, SITE_ORIGIN);
      if (parsed.pathname !== ADMIN_ORDERS_PATH) return ADMIN_ORDERS_PATH;
      return `${parsed.pathname}${parsed.search}`;
    } catch {
      return ADMIN_ORDERS_PATH;
    }
  }

  return {
    buildStaffPlanningContext,
    normalizeOrderServiceType,
    normalizeOrderFrequency,
    normalizeOrderPaymentStatus,
    normalizeOrderPaymentMethod,
    normalizeOrderStatus,
    getOrderSelectedDate,
    getOrderSelectedTime,
    getOrderServiceType,
    getOrderFrequency,
    getOrderAssignedStaff,
    getOrderPaymentStatus,
    getOrderPaymentMethod,
    isOrderCreatedEntry,
    getOrderStatus,
    collectAdminOrderRecords,
    filterAdminOrderRecords,
    countOrdersByStatus,
    getOrdersFilters,
    buildOrdersReturnPath,
  };
}

module.exports = {
  createAdminOrderDomain,
};
