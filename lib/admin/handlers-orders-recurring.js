"use strict";

const { matchesRecurringIdentity } = require("../quote-ops/recurring-identity");
const { isAwaitingOrderManagerConfirmation } = require("../admin-order-state");
const { scheduleGuard, scheduledOccurrence, scheduleError, isMovable } = require("../quote-ops/recurring-schedule");

const seriesGenerationQueues = new WeakMap();

function createAdminOrdersRecurringHelpers(deps = {}) {
  const {
    addRecurringScheduleDate,
    buildRecurringOrderSeriesSubmissions,
    getEntryOrderState,
    normalizeAdminOrderDateInput,
    normalizeString,
  } = deps;

  function getOrderState(entry = {}) {
    return typeof getEntryOrderState === "function" ? getEntryOrderState(entry) : {};
  }

  async function listSeriesContext(quoteOpsLedger) {
    return typeof quoteOpsLedger.listAllEntries === "function"
      ? quoteOpsLedger.listAllEntries()
      : quoteOpsLedger.listEntries({ limit: 5000 });
  }

  function getSelectedDate(entry = {}) {
    const order = getOrderState(entry);
    const value = order.selectedDate || entry.selectedDate;
    return typeof normalizeAdminOrderDateInput === "function"
      ? normalizeAdminOrderDateInput(value)
      : normalizeString(value, 32);
  }

  function getSeriesId(entry = {}) {
    const order = getOrderState(entry);
    const explicitSeriesId = normalizeString(order.recurringSeriesId, 120);
    if (explicitSeriesId) return explicitSeriesId;
    return normalizeString(
      order.recurringSourceRequestId ||
        entry.requestId ||
        entry.id,
      120
    ).replace(/(?:-next-\d{8})+$/, "");
  }

  function getOccurrenceDate(entry = {}) {
    const order = getOrderState(entry);
    return (
      (typeof normalizeAdminOrderDateInput === "function"
        ? normalizeAdminOrderDateInput(order.recurringOccurrenceDate)
        : normalizeString(order.recurringOccurrenceDate, 32)) ||
      getSelectedDate(entry)
    );
  }

  function getOccurrenceIndex(entry = {}) {
    const raw = getOrderState(entry).recurringOccurrenceIndex;
    if (raw === null || raw === undefined || raw === "") return null;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
  }

  function hasRecurringSeriesMetadata(entry = {}) {
    const order = getOrderState(entry);
    return Boolean(
      normalizeString(order.recurringSeriesId, 120) ||
        normalizeString(order.recurringAnchorDate, 32) ||
        normalizeString(order.recurringOccurrenceDate, 32) ||
        normalizeString(order.recurringSourceEntryId, 120) ||
        normalizeString(order.recurringSourceRequestId, 120) ||
        normalizeString(order.recurringNextEntryId, 120)
    );
  }

  function canGenerateRecurringOrderSeries(entry = {}) {
    if (isAwaitingOrderManagerConfirmation(entry)) return false;
    const order = getOrderState(entry);
    if (["canceled", "rescheduled"].includes(normalizeString(order.status, 40).toLowerCase())) {
      return false;
    }
    // Existing series keep their schedule; a new website order needs a manager's approval,
    // not just the scheduled status that policy acceptance can set automatically.
    return Boolean(
      order.managerConfirmedAt ||
        hasRecurringSeriesMetadata(entry) ||
        !normalizeString(entry.sourceRoute, 120) ||
        normalizeString(entry.sourceRoute, 120).startsWith("/admin/")
    );
  }

  function getChicagoDateValue(value = new Date()) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(value);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  }

  function getEntryById(entries = []) {
    return new Map(
      entries
        .filter((entry) => entry && entry.id)
        .map((entry) => [normalizeString(entry.id, 120), entry])
    );
  }

  function findSeriesRootAndIndex(sourceEntry, entryById) {
    let current = sourceEntry;
    let index = 0;
    const visited = new Set();

    while (current && current.id && !visited.has(current.id)) {
      visited.add(current.id);
      const sourceEntryId = normalizeString(getOrderState(current).recurringSourceEntryId, 120);
      if (!sourceEntryId) break;
      const parent = entryById.get(sourceEntryId);
      if (!parent) break;
      current = parent;
      index += 1;
    }

    return {
      rootEntry: current || sourceEntry,
      sourceOccurrenceIndex: index,
    };
  }

  function collectSeriesEntries(entries, seriesId, sourceEntry) {
    const sourceId = normalizeString(sourceEntry && sourceEntry.id, 120);
    const normalizedSeriesId = normalizeString(seriesId, 120);
    const entryById = getEntryById(entries);
    return entries.filter((entry) => {
      if (!entry || !entry.id) return false;
      if (normalizeString(entry.id, 120) === sourceId) return true;
      const order = getOrderState(entry);
      if (Object.keys(order).length === 0) return false;
      if (getSeriesId(entry) === normalizedSeriesId) return true;
      if (normalizeString(order.recurringSeriesId, 120)) return false;
      return getSeriesId(findSeriesRootAndIndex(entry, entryById).rootEntry) === normalizedSeriesId;
    });
  }

  function inferOccurrenceIndex(date, anchorDate, frequency) {
    if (!date || !anchorDate) return null;
    if (date === anchorDate) return 0;
    let index;
    if (frequency === "monthly") {
      index = (Number(date.slice(0, 4)) - Number(anchorDate.slice(0, 4))) * 12 +
        Number(date.slice(5, 7)) - Number(anchorDate.slice(5, 7));
    } else {
      const days = { weekly: 7, biweekly: 14, every3weeks: 21 }[frequency];
      if (!days) return null;
      index = (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${anchorDate}T00:00:00Z`)) / (days * 86400000);
    }
    return Number.isInteger(index) && index > 0 && typeof addRecurringScheduleDate === "function" &&
      addRecurringScheduleDate(anchorDate, frequency, index) === date ? index : null;
  }

  function inferOccurrence(entry, entryById, anchorDate, frequency) {
    const order = getOrderState(entry);
    const suffix = normalizeString(entry.requestId, 120).match(/-next-(\d{4})(\d{2})(\d{2})$/);
    const requestedDate = suffix ? `${suffix[1]}-${suffix[2]}-${suffix[3]}` : "";
    const knownDate = normalizeString(order.recurringOccurrenceDate, 32) || requestedDate;
    const index = getOccurrenceIndex(entry) ?? inferOccurrenceIndex(knownDate, anchorDate, frequency) ??
      inferOccurrenceIndex(getSelectedDate(entry), anchorDate, frequency) ??
      findSeriesRootAndIndex(entry, entryById).sourceOccurrenceIndex;
    return {
      index,
      date: knownDate || (index > 0 && typeof addRecurringScheduleDate === "function"
        ? addRecurringScheduleDate(anchorDate, frequency, index) : anchorDate),
    };
  }

  async function migrateSeriesMetadata(quoteOpsLedger, sourceEntry, allEntries) {
    const entryById = getEntryById(allEntries);
    const { rootEntry } = findSeriesRootAndIndex(sourceEntry, entryById);
    const sourceOrder = getOrderState(sourceEntry);
    const rootOrder = getOrderState(rootEntry);
    const seriesId = normalizeString(sourceOrder.recurringSeriesId || rootOrder.recurringSeriesId, 120) || getSeriesId(rootEntry);
    const frequency = normalizeString(sourceOrder.frequency || rootOrder.frequency, 40).toLowerCase();
    let anchorDate = normalizeString(sourceOrder.recurringAnchorDate || rootOrder.recurringAnchorDate, 32);
    if (!anchorDate) {
      const knownAnchors = new Set(collectSeriesEntries(allEntries, seriesId, sourceEntry)
        .map(entry => normalizeString(getOrderState(entry).recurringAnchorDate, 32)).filter(Boolean));
      if (knownAnchors.size > 1) throw new Error("Ambiguous recurring series anchor.");
      anchorDate = [...knownAnchors][0] || getSelectedDate(rootEntry) || getSelectedDate(sourceEntry);
    }
    // Generated siblings can share a parent; parent depth is not their occurrence number.
    const occurrence = inferOccurrence(sourceEntry, entryById, anchorDate, frequency);
    const occurrenceIndex = occurrence.index;
    const occurrenceDate = occurrence.date;

    let updatedSource = sourceEntry;
    if (typeof quoteOpsLedger.updateOrderEntry === "function") {
      updatedSource = await quoteOpsLedger.updateOrderEntry(sourceEntry.id, {
        requireExistingOrder: true,
        recurringSeriesId: seriesId,
        recurringAnchorDate: anchorDate,
        recurringOccurrenceDate: occurrenceDate || getSelectedDate(sourceEntry),
        recurringOccurrenceIndex: occurrenceIndex,
      });
      if (!updatedSource) throw new Error("Recurring source changed or no longer exists.");
    }

    const seriesEntries = collectSeriesEntries(allEntries, seriesId, updatedSource);
    for (const entry of seriesEntries) {
      const order = getOrderState(entry);
      if (order.recurringOccurrenceDate && getOccurrenceIndex(entry) !== null &&
        normalizeString(order.recurringSeriesId, 120) === seriesId) {
        continue;
      }
      const occurrence = inferOccurrence(entry, entryById, anchorDate, frequency);
      if (typeof quoteOpsLedger.updateOrderEntry === "function") {
        await quoteOpsLedger.updateOrderEntry(entry.id, {
          requireExistingOrder: true,
          ...(!order.frequency && !order.recurringSeriesId ? { frequency } : {}),
          recurringSeriesId: seriesId,
          recurringAnchorDate: anchorDate,
          recurringOccurrenceDate: occurrence.date || getSelectedDate(entry),
          recurringOccurrenceIndex: occurrence.index,
        });
      }
    }

    return {
      updatedSource,
      seriesId,
      anchorDate,
      occurrenceDate: getOccurrenceDate(updatedSource),
      occurrenceIndex: getOccurrenceIndex(updatedSource) || 0,
    };
  }

  async function copySeriesAssignment(staffStore, sourceEntryId, seriesEntries, quoteOpsLedger) {
    if (
      !staffStore ||
      typeof staffStore.getSnapshot !== "function" ||
      typeof staffStore.setAssignment !== "function"
    ) {
      return;
    }

    const snapshot = await staffStore.getSnapshot();
    const assignments = Array.isArray(snapshot.assignments) ? snapshot.assignments : [];
    const assignmentByEntryId = new Map(assignments.map((record) => [record.entryId, record]));
    const isUsableAssignment = (assignment) =>
      Boolean(
        assignment &&
          assignment.status !== "canceled" &&
          Array.isArray(assignment.staffIds) &&
          assignment.staffIds.length > 0
      );
    const directSourceAssignment = assignmentByEntryId.get(sourceEntryId);
    const sourceAssignment = isUsableAssignment(directSourceAssignment)
      ? directSourceAssignment
      : seriesEntries
          .map((entry) => assignmentByEntryId.get(entry && entry.id))
          .find(isUsableAssignment);
    if (!sourceAssignment) {
      return;
    }

    for (const entry of seriesEntries) {
      if (!entry) continue;
      const currentAssignment = assignmentByEntryId.get(entry.id);
      if (isUsableAssignment(currentAssignment)) continue;
      const currentEntry = quoteOpsLedger && typeof quoteOpsLedger.getEntry === "function"
        ? await quoteOpsLedger.getEntry(entry.id)
        : entry;
      if (!currentEntry || Object.keys(getOrderState(currentEntry)).length === 0) continue;
      const orderStatus = normalizeString(getOrderState(currentEntry).status, 40).toLowerCase();
      if (["canceled", "cancelled", "rescheduled"].includes(orderStatus)) continue;
      await staffStore.setAssignment(entry.id, {
        staffIds: sourceAssignment.staffIds,
        scheduleDate: "",
        scheduleTime: "",
        status: sourceAssignment.status === "confirmed" ? "confirmed" : "planned",
        notes: "",
      });
    }
  }

  async function updateRecurringOrderSeriesFuturePrice({
    quoteOpsLedger,
    sourceEntry,
    totalPrice,
  } = {}) {
    if (
      !quoteOpsLedger ||
      !sourceEntry ||
      typeof quoteOpsLedger.listEntries !== "function" ||
      typeof quoteOpsLedger.updateOrderEntry !== "function"
    ) {
      return [];
    }

    const sourceOrder = getOrderState(sourceEntry);
    if (!normalizeString(sourceOrder.frequency, 40) && !hasRecurringSeriesMetadata(sourceEntry)) {
      return [];
    }

    const allEntries = await listSeriesContext(quoteOpsLedger);
    const metadata = await migrateSeriesMetadata(quoteOpsLedger, sourceEntry, allEntries);
    const refreshedEntries = await listSeriesContext(quoteOpsLedger);
    const refreshedSource =
      (typeof quoteOpsLedger.getEntry === "function"
        ? await quoteOpsLedger.getEntry(sourceEntry.id)
        : null) || metadata.updatedSource || sourceEntry;
    const sourceIndex = getOccurrenceIndex(refreshedSource);
    const sourceOccurrenceDate = getOccurrenceDate(refreshedSource);
    const futureEntries = collectSeriesEntries(
      refreshedEntries,
      metadata.seriesId,
      refreshedSource
    ).filter((entry) => {
      if (!entry || normalizeString(entry.id, 120) === normalizeString(refreshedSource.id, 120)) {
        return false;
      }
      const order = getOrderState(entry);
      const status = normalizeString(order.status, 40).toLowerCase();
      if (["completed", "canceled", "cancelled", "rescheduled"].includes(status)) return false;

      const occurrenceIndex = getOccurrenceIndex(entry);
      if (sourceIndex !== null && occurrenceIndex !== null) return occurrenceIndex > sourceIndex;
      return Boolean(sourceOccurrenceDate && getOccurrenceDate(entry) > sourceOccurrenceDate);
    });

    const updatedEntries = [];
    for (const entry of futureEntries) {
      const updatedEntry = await quoteOpsLedger.updateOrderEntry(entry.id, { totalPrice });
      if (updatedEntry) updatedEntries.push(updatedEntry);
    }
    return updatedEntries;
  }

  async function updateRecurringOrderSeriesFutureComment({
    quoteOpsLedger,
    sourceEntry,
    additionalDetails = "",
  } = {}) {
    if (
      !quoteOpsLedger ||
      !sourceEntry ||
      typeof quoteOpsLedger.listEntries !== "function" ||
      typeof quoteOpsLedger.updateOrderEntry !== "function"
    ) {
      return [];
    }

    const normalizedComment = normalizeString(additionalDetails, 4000);
    const allEntries = await listSeriesContext(quoteOpsLedger);
    const sourceOrder = getOrderState(sourceEntry);
    const sourcePhone = normalizeString(sourceEntry.customerPhone, 80).replace(/\D+/g, "");
    const sourceEmail = normalizeString(sourceEntry.customerEmail, 250).toLowerCase();
    const sourceAddress = normalizeString(sourceEntry.fullAddress, 500).toLowerCase();
    const sourceHasSeries = Boolean(
      normalizeString(sourceOrder.frequency, 40) || hasRecurringSeriesMetadata(sourceEntry)
    );
    const matchingSeriesEntry = sourceHasSeries
      ? sourceEntry
      : allEntries.find((entry) => {
          if (!entry || normalizeString(entry.id, 120) === normalizeString(sourceEntry.id, 120)) return false;
          const order = getOrderState(entry);
          const status = normalizeString(order.status, 40).toLowerCase();
          if (!normalizeString(order.frequency, 40) || ["canceled", "cancelled", "rescheduled"].includes(status)) {
            return false;
          }
          const phone = normalizeString(entry.customerPhone, 80).replace(/\D+/g, "");
          const email = normalizeString(entry.customerEmail, 250).toLowerCase();
          const address = normalizeString(entry.fullAddress, 500).toLowerCase();
          const sameClient = Boolean(
            (sourcePhone && phone === sourcePhone) || (sourceEmail && email === sourceEmail)
          );
          return sameClient && (!sourceAddress || !address || sourceAddress === address);
        });
    if (!matchingSeriesEntry) return [];

    const metadata = await migrateSeriesMetadata(quoteOpsLedger, matchingSeriesEntry, allEntries);
    if (!sourceHasSeries) {
      const sourceSelectedDate = getSelectedDate(sourceEntry);
      const matchingOccurrence = collectSeriesEntries(allEntries, metadata.seriesId, metadata.updatedSource)
        .find((entry) => getOccurrenceDate(entry) === sourceSelectedDate);
      const matchingOccurrenceIndex = matchingOccurrence ? getOccurrenceIndex(matchingOccurrence) : null;
      await quoteOpsLedger.updateOrderEntry(sourceEntry.id, {
        frequency: normalizeString(getOrderState(metadata.updatedSource).frequency, 40),
        recurringSeriesId: metadata.seriesId,
        recurringAnchorDate: metadata.anchorDate,
        recurringOccurrenceDate: sourceSelectedDate,
        ...(matchingOccurrenceIndex === null ? {} : { recurringOccurrenceIndex: matchingOccurrenceIndex }),
      });
    }
    const refreshedEntries = await listSeriesContext(quoteOpsLedger);
    const refreshedSource = refreshedEntries.find(
      (entry) => normalizeString(entry.id, 120) === normalizeString(sourceEntry.id, 120)
    ) || sourceEntry;
    const sourceDate = getOccurrenceDate(refreshedSource) || getSelectedDate(refreshedSource);
    const sourceId = normalizeString(refreshedSource.id, 120);
    const applicableEntries = collectSeriesEntries(
      refreshedEntries,
      metadata.seriesId,
      refreshedSource
    ).filter((entry) => {
      const order = getOrderState(entry);
      const status = normalizeString(order.status, 40).toLowerCase();
      const occurrenceDate = getOccurrenceDate(entry) || getSelectedDate(entry);
      return (
        !["completed", "canceled", "cancelled", "rescheduled"].includes(status) &&
        (normalizeString(entry.id, 120) === sourceId || Boolean(sourceDate && occurrenceDate >= sourceDate))
      );
    });

    const updatedEntries = [];
    for (const entry of applicableEntries) {
      const updatedEntry = await quoteOpsLedger.updateOrderEntry(entry.id, {
        quoteCalculatorData: { additionalDetails: normalizedComment },
        recurringAdditionalDetails: normalizedComment,
      });
      if (updatedEntry) updatedEntries.push(updatedEntry);
    }
    return updatedEntries;
  }

  async function updateRecurringOrderSeriesFutureAssignment({
    quoteOpsLedger,
    sourceEntry,
    staffStore,
    assignedStaff = "",
    staffIds = [],
  } = {}) {
    if (
      !quoteOpsLedger ||
      !sourceEntry ||
      !staffStore ||
      typeof quoteOpsLedger.listEntries !== "function" ||
      typeof quoteOpsLedger.updateOrderEntry !== "function" ||
      typeof staffStore.getSnapshot !== "function" ||
      typeof staffStore.setAssignment !== "function"
    ) {
      return [];
    }

    const sourceOrder = getOrderState(sourceEntry);
    if (!normalizeString(sourceOrder.frequency, 40) && !hasRecurringSeriesMetadata(sourceEntry)) {
      return [];
    }

    const allEntries = await listSeriesContext(quoteOpsLedger);
    const metadata = await migrateSeriesMetadata(quoteOpsLedger, sourceEntry, allEntries);
    const refreshedEntries = await listSeriesContext(quoteOpsLedger);
    const refreshedSource =
      refreshedEntries.find(
        (entry) => normalizeString(entry && entry.id, 120) === normalizeString(sourceEntry.id, 120)
      ) || metadata.updatedSource || sourceEntry;
    const sourceIndex = getOccurrenceIndex(refreshedSource);
    const sourceDate = getOccurrenceDate(refreshedSource) || getSelectedDate(refreshedSource);
    const snapshot = await staffStore.getSnapshot();
    const assignmentByEntryId = new Map(
      (Array.isArray(snapshot.assignments) ? snapshot.assignments : []).map((record) => [
        record.entryId,
        record,
      ])
    );
    const futureEntries = collectSeriesEntries(
      refreshedEntries,
      metadata.seriesId,
      refreshedSource
    ).filter((entry) => {
      if (!entry || normalizeString(entry.id, 120) === normalizeString(refreshedSource.id, 120)) {
        return false;
      }
      const order = getOrderState(entry);
      const status = normalizeString(order.status, 40).toLowerCase();
      if (["completed", "canceled", "cancelled", "rescheduled"].includes(status)) return false;
      const occurrenceIndex = getOccurrenceIndex(entry);
      if (sourceIndex !== null && occurrenceIndex !== null) return occurrenceIndex > sourceIndex;
      const occurrenceDate = getOccurrenceDate(entry) || getSelectedDate(entry);
      return Boolean(sourceDate && occurrenceDate > sourceDate);
    });

    const updatedEntries = [];
    for (const entry of futureEntries) {
      const updatedEntry = await quoteOpsLedger.updateOrderEntry(entry.id, { assignedStaff });
      if (!updatedEntry) continue;
      const existingAssignment = assignmentByEntryId.get(entry.id);
      await staffStore.setAssignment(entry.id, {
        staffIds,
        scheduleDate: "",
        scheduleTime: "",
        status: existingAssignment && existingAssignment.status === "confirmed" ? "confirmed" : "planned",
        notes: existingAssignment ? existingAssignment.notes : "",
        calendarSync: existingAssignment ? existingAssignment.calendarSync : null,
      });
      updatedEntries.push(updatedEntry);
    }
    return updatedEntries;
  }

  async function withSeriesGenerationQueue(options, operation, emptyResult) {
    const { quoteOpsLedger, sourceEntry } = options;
    if (!quoteOpsLedger || !sourceEntry) return emptyResult;
    const latestSource = typeof quoteOpsLedger.getEntry === "function"
      ? await quoteOpsLedger.getEntry(sourceEntry.id) : sourceEntry;
    if (!latestSource) return emptyResult;
    const root = normalizeString(getOrderState(latestSource).recurringSeriesId, 120)
      ? latestSource
      : findSeriesRootAndIndex(latestSource, getEntryById(await listSeriesContext(quoteOpsLedger))).rootEntry;
    const seriesId = getSeriesId(root);
    let queues = seriesGenerationQueues.get(quoteOpsLedger);
    if (!queues) {
      queues = new Map();
      seriesGenerationQueues.set(quoteOpsLedger, queues);
    }
    const previous = queues.get(seriesId) || Promise.resolve();
    const pending = previous.catch(() => {}).then(async () => {
      const freshSource = typeof quoteOpsLedger.getEntry === "function"
        ? await quoteOpsLedger.getEntry(sourceEntry.id)
        : sourceEntry;
      return freshSource ? operation({ ...options, sourceEntry: freshSource }) : emptyResult;
    });
    queues.set(seriesId, pending);
    try {
      return await pending;
    } finally {
      if (queues.get(seriesId) === pending) queues.delete(seriesId);
    }
  }

  async function ensureRecurringOrderSeries(options = {}) {
    return withSeriesGenerationQueue(options, generateRecurringOrderSeries, []);
  }

  async function rescheduleRecurringOrderSeries(options = {}) {
    return withSeriesGenerationQueue(options, async ({ quoteOpsLedger, sourceEntry, selectedDate, selectedTime, staffStore, expectedDate, expectedTime, allowSourceMarkerOnly }) => {
      if (typeof quoteOpsLedger.rescheduleRecurringEntries !== "function") {
        throw scheduleError("Безопасный перенос серии недоступен. Изменения не сохранены.");
      }
      const entries = await listSeriesContext(quoteOpsLedger);
      const byId = getEntryById(entries);
      const root = findSeriesRootAndIndex(sourceEntry, byId).rootEntry;
      const sourceOrder = getOrderState(sourceEntry);
      if ((expectedDate && expectedDate !== getSelectedDate(sourceEntry)) ||
          (expectedTime && expectedTime !== (sourceOrder.selectedTime || sourceEntry.selectedTime))) {
        if (selectedDate === getSelectedDate(sourceEntry) && selectedTime === (sourceOrder.selectedTime || sourceEntry.selectedTime)) return [];
        throw scheduleError("Дата уже изменена другим сотрудником. Обновите страницу.");
      }
      const seriesId = getSeriesId(sourceEntry);
      const frequency = normalizeString(sourceOrder.frequency, 40).toLowerCase();
      const anchor = sourceOrder.recurringAnchorDate || getOrderState(root).recurringAnchorDate || getSelectedDate(root);
      if (!frequency || !selectedDate || !selectedTime || typeof addRecurringScheduleDate !== "function") {
        throw scheduleError("Для переноса серии нужны дата, время и периодичность.");
      }
      const members = collectSeriesEntries(entries, seriesId, sourceEntry);
      // Never guess across an ambiguous legacy chain or resurrect an explicitly stopped series.
      if (members.some(entry => getOrderState(entry).recurringSeriesCanceledFromDate)) {
        throw scheduleError("Серия остановлена. Сначала проверьте её отменённое продолжение.");
      }
      const sourceIndex = inferOccurrence(sourceEntry, byId, anchor, frequency).index;
      const version = Math.max(0, ...scheduleGuard(members, seriesId).map(item => Number(item.schedule.version) || 0)) + 1;
      const changes = [];
      for (const entry of members) {
        const index = inferOccurrence(entry, byId, anchor, frequency).index;
        if (index < sourceIndex) continue;
        const order = getOrderState(entry);
        if (entry.id !== sourceEntry.id && ["canceled", "cancelled"].includes(order.status)) continue;
        const markerOnly = entry.id === sourceEntry.id && allowSourceMarkerOnly && sourceOrder.recurringPendingScheduleMove === true &&
          getSelectedDate(entry) === selectedDate && (order.selectedTime || entry.selectedTime) === selectedTime;
        if (!isMovable(entry) && !markerOnly) throw scheduleError("В продолжении есть начатая или оплаченная уборка. Изменения не сохранены.");
        if (entry.id !== sourceEntry.id && index === sourceIndex) throw scheduleError("Неоднозначный номер уборки в серии.");
        const date = index === sourceIndex ? selectedDate : addRecurringScheduleDate(selectedDate, frequency, index - sourceIndex);
        changes.push({ id: entry.id, date, time: selectedTime, ...(markerOnly ? { markerOnly: true } : {}), ...(entry.id === sourceEntry.id
          ? { marker: { index: sourceIndex, date: selectedDate, time: selectedTime, frequency, version } } : {}) });
      }
      const snapshot = staffStore && typeof staffStore.getSnapshot === "function" ? await staffStore.getSnapshot() : {};
      if ((snapshot.assignments || []).some(assignment => changes.some(change => change.id === assignment.entryId) &&
        (assignment.scheduleDate || assignment.scheduleTime))) {
        throw scheduleError("У уборки есть отдельный слот команды. Сначала согласуйте его с датой заказа.");
      }
      return quoteOpsLedger.rescheduleRecurringEntries({ seriesId, sourceId: sourceEntry.id,
        members: members.map(entry => ({ id: entry.id, updatedAt: entry.updatedAt })), changes });
    }, []);
  }

  async function generateRecurringOrderSeries({
    quoteOpsLedger,
    sourceEntry,
    staffStore,
    horizonMonths = 6,
  } = {}) {
    if (
      !quoteOpsLedger ||
      !sourceEntry ||
      typeof quoteOpsLedger.listEntries !== "function" ||
      typeof quoteOpsLedger.recordSubmission !== "function" ||
      typeof buildRecurringOrderSeriesSubmissions !== "function"
    ) {
      return [];
    }

    const frequency = normalizeString(getOrderState(sourceEntry).frequency, 40).toLowerCase();
    if (!frequency || !canGenerateRecurringOrderSeries(sourceEntry) || getOrderState(sourceEntry).recurringPendingResetFromDate) return [];

    const allEntries = await listSeriesContext(quoteOpsLedger);
    if (collectSeriesEntries(allEntries, getSeriesId(sourceEntry), sourceEntry)
      .some(entry => getOrderState(entry).recurringPendingResetFromDate)) return [];
    const metadata = await migrateSeriesMetadata(quoteOpsLedger, sourceEntry, allEntries);
    const refreshedEntries = await listSeriesContext(quoteOpsLedger);
    const currentSeriesEntries = collectSeriesEntries(
      refreshedEntries,
      metadata.seriesId,
      metadata.updatedSource
    );
    const canceledFromDate = currentSeriesEntries
      .map((entry) => normalizeString(getOrderState(entry).recurringSeriesCanceledFromDate, 32))
      .filter(Boolean)
      .sort()[0] || "";
    const existingOccurrenceDates = new Set(currentSeriesEntries.map(getOccurrenceDate).filter(Boolean));
    const scheduleSlot = entry => `${getSelectedDate(entry)}T${normalizeString(getOrderState(entry).selectedTime || entry.selectedTime, 32)}`;
    const existingScheduleSlots = new Set(currentSeriesEntries
      .filter(entry => !["canceled", "cancelled", "rescheduled"].includes(normalizeString(getOrderState(entry).status, 40).toLowerCase()))
      .map(scheduleSlot));
    const existingByRequestId = new Map(
      refreshedEntries.filter(entry => matchesRecurringIdentity(entry, { seriesId: metadata.seriesId }))
        .map((entry) => [normalizeString(entry.requestId, 120), entry])
    );
    const submissions = buildRecurringOrderSeriesSubmissions(metadata.updatedSource, {
      frequency,
      currentOccurrenceDate: metadata.occurrenceDate,
      currentOccurrenceIndex: metadata.occurrenceIndex,
      recurringAnchorDate: metadata.anchorDate,
      horizonMonths,
      orderStatus: "scheduled",
    });
    const seriesSchedule = scheduleGuard(currentSeriesEntries, metadata.seriesId);
    for (const submission of submissions) {
      const order = getOrderState({ payloadForRetry: submission.payloadForRetry });
      const scheduled = scheduledOccurrence(seriesSchedule, Number(order.recurringOccurrenceIndex), addRecurringScheduleDate);
      if (scheduled) {
        submission.selectedDate = scheduled.date;
        submission.selectedTime = scheduled.time;
        for (const key of ["orderState", "adminOrder", "calculatorData"]) {
          const state = submission.payloadForRetry[key];
          if (state) { state.selectedDate = scheduled.date; state.selectedTime = scheduled.time; }
        }
      }
      if (submission.recurringSourceGuard) submission.recurringSourceGuard.schedule = seriesSchedule;
    }
    const createdEntries = [];

    for (const submission of submissions) {
      const submissionOrder = getOrderState({
        payloadForRetry: submission.payloadForRetry,
      });
      const occurrenceDate = normalizeString(submissionOrder.recurringOccurrenceDate, 32);
      const requestId = normalizeString(submission.requestId, 120);
      const existingEntry = existingByRequestId.get(requestId);
      if (
        !occurrenceDate ||
        (canceledFromDate && occurrenceDate >= canceledFromDate) ||
        existingOccurrenceDates.has(occurrenceDate) ||
        existingScheduleSlots.has(scheduleSlot(submission)) ||
        (existingEntry && Object.keys(getOrderState(existingEntry)).length === 0) ||
        (existingEntry && normalizeString(getOrderState(existingEntry).recurringSeriesId, 120))
      ) {
        continue;
      }
      // Older generated visits may have the right request ID but no series metadata yet.
      let entry = existingEntry || await quoteOpsLedger.recordSubmission(submission);
      if (!entry) continue;
      if (typeof quoteOpsLedger.updateOrderEntry === "function") {
        entry =
          (await quoteOpsLedger.updateOrderEntry(entry.id, {
            requireExistingOrder: true,
            frequency,
            recurringSeriesId: metadata.seriesId,
            recurringAnchorDate: metadata.anchorDate,
            recurringOccurrenceDate: occurrenceDate,
            recurringOccurrenceIndex: Number(submissionOrder.recurringOccurrenceIndex) || 0,
            recurringSourceEntryId: normalizeString(submissionOrder.recurringSourceEntryId, 120),
            recurringSourceRequestId: normalizeString(submissionOrder.recurringSourceRequestId, 120),
          })) || entry;
      }
      if (!existingEntry) createdEntries.push(entry);
      currentSeriesEntries.push(entry);
      existingOccurrenceDates.add(occurrenceDate);
      existingScheduleSlots.add(scheduleSlot(entry));
      existingByRequestId.set(requestId, entry);
    }

    const orderedSeriesEntries = currentSeriesEntries
      .filter((entry) => getOccurrenceDate(entry))
      .sort((left, right) => {
        const indexDifference = (getOccurrenceIndex(left) || 0) - (getOccurrenceIndex(right) || 0);
        if (indexDifference !== 0) return indexDifference;
        return getOccurrenceDate(left).localeCompare(getOccurrenceDate(right));
      });
    if (typeof quoteOpsLedger.updateOrderEntry === "function") {
      for (let index = 0; index < orderedSeriesEntries.length; index += 1) {
        const entry = orderedSeriesEntries[index];
        const nextEntry = orderedSeriesEntries[index + 1] || null;
        await quoteOpsLedger.updateOrderEntry(entry.id, {
          requireExistingOrder: true,
          recurringNextEntryId: nextEntry ? nextEntry.id : "",
          recurringGeneratedAt: nextEntry ? normalizeString(nextEntry.createdAt, 80) : "",
          recurringSeriesId: metadata.seriesId,
          recurringAnchorDate: metadata.anchorDate,
        });
      }
    }

    await copySeriesAssignment(
      staffStore,
      normalizeString(metadata.updatedSource.id, 120),
      orderedSeriesEntries,
      quoteOpsLedger
    );
    return createdEntries;
  }

  async function ensureAllRecurringOrderSeries({
    quoteOpsLedger,
    staffStore,
    today = getChicagoDateValue(),
  } = {}) {
    if (!quoteOpsLedger || typeof quoteOpsLedger.listEntries !== "function") {
      return [];
    }

    let allEntries = await listSeriesContext(quoteOpsLedger);
    const stoppedSeriesIds = new Set();

    for (const entry of allEntries) {
      const order = getOrderState(entry);
      const frequency = normalizeString(order.frequency, 40).toLowerCase();
      const seriesId = normalizeString(order.recurringSeriesId, 120);
      if (frequency || !seriesId || !hasRecurringSeriesMetadata(entry) || stoppedSeriesIds.has(seriesId) || order.recurringPendingResetFromDate) {
        continue;
      }

      const seriesEntries = collectSeriesEntries(allEntries, seriesId, entry);
      const hasActiveRecurringSibling = seriesEntries.some(
        (candidate) => normalizeString(getOrderState(candidate).frequency, 40).toLowerCase()
      );
      const wasCanceledAsSeries = seriesEntries.some((candidate) =>
        normalizeString(getOrderState(candidate).recurringSeriesCanceledFromDate, 32)
      );
      if (!hasActiveRecurringSibling || wasCanceledAsSeries) continue;

      await stopRecurringOrderSeries({
        quoteOpsLedger,
        sourceEntry: entry,
        staffStore,
      });
      stoppedSeriesIds.add(seriesId);
    }

    if (stoppedSeriesIds.size > 0) {
      allEntries = await listSeriesContext(quoteOpsLedger);
    }

    const entryById = getEntryById(allEntries);
    const groups = new Map();

    for (const entry of allEntries) {
      const order = getOrderState(entry);
      const frequency = normalizeString(order.frequency, 40).toLowerCase();
      const selectedDate = getSelectedDate(entry);
      if (!frequency || !selectedDate || !canGenerateRecurringOrderSeries(entry)) continue;

      const root = findSeriesRootAndIndex(entry, entryById).rootEntry || entry;
      const seriesKey = normalizeString(
        order.recurringSeriesId ||
          getOrderState(root).recurringSeriesId ||
          root.requestId ||
          root.id,
        120
      );
      if (!seriesKey) continue;

      const group = groups.get(seriesKey) || {
        entries: [],
        canceled: false,
        legacy: false,
      };
      group.entries.push(entry);
      if (normalizeString(order.recurringSeriesCanceledFromDate, 32)) {
        group.canceled = true;
      }
      if (
        !normalizeString(order.recurringAnchorDate, 32) ||
        !normalizeString(order.recurringOccurrenceDate, 32) ||
        !Number.isFinite(Number(order.recurringOccurrenceIndex))
      ) {
        group.legacy = true;
      }
      groups.set(seriesKey, group);
    }

    const createdEntries = [];
    for (const group of groups.values()) {
      if (group.canceled) continue;

      const activeEntries = group.entries
        .filter((entry) => {
          const status = normalizeString(getOrderState(entry).status, 40).toLowerCase();
          return status !== "canceled" && status !== "rescheduled";
        })
        .sort((left, right) => getSelectedDate(left).localeCompare(getSelectedDate(right)));
      if (activeEntries.length === 0) continue;

      const futureEntries = activeEntries.filter((entry) => getSelectedDate(entry) >= today);
      const sourceEntry =
        futureEntries.find((entry) => {
          const serviceType = normalizeString(
            entry.serviceType || getOrderState(entry).serviceType,
            40
          ).toLowerCase();
          return !serviceType || serviceType === "standard";
        }) ||
        futureEntries[0] ||
        activeEntries.find((entry) => {
          const serviceType = normalizeString(
            entry.serviceType || getOrderState(entry).serviceType,
            40
          ).toLowerCase();
          return !serviceType || serviceType === "standard";
        }) ||
        activeEntries[activeEntries.length - 1];
      try {
        const created = await ensureRecurringOrderSeries({
          quoteOpsLedger,
          sourceEntry,
          staffStore,
        });
        createdEntries.push(...created);
      } catch {
        // A malformed series must not prevent the admin page from loading.
      }
    }

    return createdEntries;
  }

  async function stopRecurringOrderSeries({
    quoteOpsLedger,
    sourceEntry,
    staffStore,
  } = {}) {
    if (
      !quoteOpsLedger ||
      !sourceEntry ||
      typeof quoteOpsLedger.listEntries !== "function" ||
      typeof quoteOpsLedger.updateOrderEntry !== "function"
    ) {
      return sourceEntry || null;
    }

    const allEntries = await listSeriesContext(quoteOpsLedger);
    const seriesId = getSeriesId(sourceEntry);
    const sourceEntryId = normalizeString(sourceEntry.id, 120);
    const cutoffDate = getOccurrenceDate(sourceEntry) || getSelectedDate(sourceEntry);
    const seriesEntries = collectSeriesEntries(allEntries, seriesId, sourceEntry);
    const removedEntries = [];
    let updatedSource = sourceEntry;

    for (const entry of seriesEntries) {
      const entryId = normalizeString(entry.id, 120);
      const occurrenceDate = getOccurrenceDate(entry) || getSelectedDate(entry);
      const shouldRemove =
        entryId !== sourceEntryId &&
        Boolean(cutoffDate && occurrenceDate && occurrenceDate > cutoffDate);

      if (shouldRemove) {
        if (typeof quoteOpsLedger.deleteEntry === "function") {
          await quoteOpsLedger.deleteEntry(entryId);
        } else {
          await quoteOpsLedger.updateOrderEntry(entryId, { orderStatus: "canceled" });
        }
        removedEntries.push(entry);
        continue;
      }

      const updatedEntry = await quoteOpsLedger.updateOrderEntry(entryId, {
        frequency: "",
        recurringNextEntryId: "",
        recurringGeneratedAt: "",
        recurringSeriesId: "",
        recurringPendingResetFromDate: "",
        recurringAnchorDate: "",
        recurringOccurrenceDate: "",
        recurringSourceEntryId: "",
        recurringSourceRequestId: "",
        recurringSeriesCanceledFromDate: "",
      });
      if (entryId === sourceEntryId && updatedEntry) {
        updatedSource = updatedEntry;
      }
    }

    if (
      removedEntries.length > 0 &&
      staffStore &&
      typeof staffStore.getSnapshot === "function" &&
      typeof staffStore.setAssignment === "function"
    ) {
      const snapshot = await staffStore.getSnapshot();
      const assignmentEntryIds = new Set(
        (Array.isArray(snapshot.assignments) ? snapshot.assignments : []).map(
          (record) => record.entryId
        )
      );
      for (const entry of removedEntries) {
        if (assignmentEntryIds.has(entry.id)) {
          await staffStore.setAssignment(entry.id, { status: "canceled" });
        }
      }
    }

    return updatedSource;
  }

  async function cancelRecurringOrderSeries({
    quoteOpsLedger,
    sourceEntry,
    staffStore,
  } = {}) {
    if (
      !quoteOpsLedger ||
      !sourceEntry ||
      typeof quoteOpsLedger.listEntries !== "function" ||
      typeof quoteOpsLedger.updateOrderEntry !== "function"
    ) {
      return [];
    }

    const allEntries = await listSeriesContext(quoteOpsLedger);
    const metadata = await migrateSeriesMetadata(quoteOpsLedger, sourceEntry, allEntries);
    const refreshedEntries = await listSeriesContext(quoteOpsLedger);
    const seriesEntries = collectSeriesEntries(
      refreshedEntries,
      metadata.seriesId,
      metadata.updatedSource
    );
    const canceledFromDate = metadata.occurrenceDate || getSelectedDate(metadata.updatedSource);
    const canceledEntries = [];

    for (const entry of seriesEntries) {
      const occurrenceDate = getOccurrenceDate(entry);
      const shouldCancel = occurrenceDate && occurrenceDate >= canceledFromDate;
      const updatedEntry = await quoteOpsLedger.updateOrderEntry(entry.id, {
        ...(shouldCancel ? { orderStatus: "canceled" } : {}),
        recurringSeriesCanceledFromDate: canceledFromDate,
      });
      if (shouldCancel && updatedEntry) canceledEntries.push(updatedEntry);
    }

    if (
      staffStore &&
      typeof staffStore.getSnapshot === "function" &&
      typeof staffStore.setAssignment === "function"
    ) {
      const snapshot = await staffStore.getSnapshot();
      const assignmentByEntryId = new Map(
        (Array.isArray(snapshot.assignments) ? snapshot.assignments : []).map((record) => [
          record.entryId,
          record,
        ])
      );
      for (const entry of canceledEntries) {
        const assignment = assignmentByEntryId.get(entry.id);
        if (!assignment || assignment.status === "canceled") continue;
        await staffStore.setAssignment(entry.id, { status: "canceled" });
      }
    }

    return canceledEntries;
  }

  async function restoreRecurringOrderSeries({
    quoteOpsLedger,
    sourceEntry,
    staffStore,
  } = {}) {
    if (
      !quoteOpsLedger ||
      !sourceEntry ||
      typeof quoteOpsLedger.listEntries !== "function" ||
      typeof quoteOpsLedger.updateOrderEntry !== "function"
    ) {
      return [];
    }

    const allEntries = await listSeriesContext(quoteOpsLedger);
    const seriesId = getSeriesId(sourceEntry);
    const seriesEntries = collectSeriesEntries(allEntries, seriesId, sourceEntry);
    const frequency = seriesEntries
      .map((entry) => normalizeString(getOrderState(entry).frequency, 40).toLowerCase())
      .find(Boolean);
    const sourceOrder = getOrderState(sourceEntry);
    const restoreFromDate =
      normalizeString(sourceOrder.recurringSeriesCanceledFromDate, 32) ||
      getOccurrenceDate(sourceEntry) ||
      getSelectedDate(sourceEntry);
    const restoredEntries = [];

    for (const entry of seriesEntries) {
      const order = getOrderState(entry);
      const occurrenceDate = getOccurrenceDate(entry) || getSelectedDate(entry);
      const shouldRestore =
        normalizeString(order.status, 40).toLowerCase() === "canceled" &&
        Boolean(restoreFromDate && occurrenceDate && occurrenceDate >= restoreFromDate);
      const updatedEntry = await quoteOpsLedger.updateOrderEntry(entry.id, {
        ...(frequency ? { frequency } : {}),
        ...(shouldRestore ? { orderStatus: "scheduled" } : {}),
        recurringSeriesCanceledFromDate: "",
      });
      if (shouldRestore && updatedEntry) restoredEntries.push(updatedEntry);
    }

    const refreshedEntries = await listSeriesContext(quoteOpsLedger);
    const orderedSeriesEntries = collectSeriesEntries(refreshedEntries, seriesId, sourceEntry)
      .filter((entry) => getOccurrenceDate(entry) || getSelectedDate(entry))
      .sort((left, right) => {
        const leftDate = getOccurrenceDate(left) || getSelectedDate(left);
        const rightDate = getOccurrenceDate(right) || getSelectedDate(right);
        const indexDifference = (getOccurrenceIndex(left) || 0) - (getOccurrenceIndex(right) || 0);
        return indexDifference || leftDate.localeCompare(rightDate);
      });
    for (let index = 0; index < orderedSeriesEntries.length; index += 1) {
      const entry = orderedSeriesEntries[index];
      const nextEntry = orderedSeriesEntries[index + 1] || null;
      await quoteOpsLedger.updateOrderEntry(entry.id, {
        recurringNextEntryId: nextEntry ? nextEntry.id : "",
        recurringGeneratedAt: nextEntry ? normalizeString(nextEntry.createdAt, 80) : "",
      });
    }

    if (
      restoredEntries.length > 0 &&
      staffStore &&
      typeof staffStore.getSnapshot === "function" &&
      typeof staffStore.setAssignment === "function"
    ) {
      const snapshot = await staffStore.getSnapshot();
      const assignmentByEntryId = new Map(
        (Array.isArray(snapshot.assignments) ? snapshot.assignments : []).map((record) => [
          record.entryId,
          record,
        ])
      );
      for (const entry of restoredEntries) {
        const assignment = assignmentByEntryId.get(entry.id);
        if (!assignment || assignment.status !== "canceled") continue;
        await staffStore.setAssignment(entry.id, { status: "planned" });
      }
    }

    return restoredEntries;
  }

  async function resetRecurringOrderSeries(options = {}) {
    return withSeriesGenerationQueue(options, resetRecurringOrderSeriesUnlocked, null);
  }

  async function resetRecurringOrderSeriesUnlocked({
    quoteOpsLedger,
    sourceEntry,
    staffStore,
    resetFromDate = "",
  } = {}) {
    if (
      !quoteOpsLedger ||
      !sourceEntry ||
      typeof quoteOpsLedger.listEntries !== "function" ||
      typeof quoteOpsLedger.updateOrderEntry !== "function"
    ) {
      return sourceEntry || null;
    }

    const allEntries = await listSeriesContext(quoteOpsLedger);
    const seriesId = getSeriesId(sourceEntry);
    const sourceEntryId = normalizeString(sourceEntry.id, 120);
    const sourceDate = getSelectedDate(sourceEntry);
    const sourceIndex = getOccurrenceIndex(sourceEntry);
    const futureBoundaryDate = normalizeString(getOrderState(sourceEntry).recurringOccurrenceDate, 32) ||
      normalizeString(resetFromDate, 32) || sourceDate;
    const futureEntries = collectSeriesEntries(allEntries, seriesId, sourceEntry).filter((entry) => {
      const occurrenceDate = getOccurrenceDate(entry) || getSelectedDate(entry);
      const index = getOccurrenceIndex(entry);
      return (
        normalizeString(entry.id, 120) !== sourceEntryId &&
        (sourceIndex !== null && index !== null ? index > sourceIndex : occurrenceDate > futureBoundaryDate)
      );
    });

    // Fence stale generators before deleting the old cadence, including in other instances.
    const updatedSource = await quoteOpsLedger.updateOrderEntry(sourceEntryId, {
      requireExistingOrder: true,
      recurringSeriesId: seriesId,
      recurringAnchorDate: sourceDate,
      recurringOccurrenceDate: sourceDate,
      recurringOccurrenceIndex: 0,
      recurringPendingResetFromDate: "",
      recurringNextEntryId: "",
      recurringGeneratedAt: "",
      recurringSeriesCanceledFromDate: "",
    });
    if (!updatedSource) throw new Error("Recurring source changed before the series reset.");

    for (const entry of futureEntries) {
      if (typeof quoteOpsLedger.deleteEntry === "function") {
        await quoteOpsLedger.deleteEntry(entry.id);
      } else {
        await quoteOpsLedger.updateOrderEntry(entry.id, { orderStatus: "canceled" });
      }
    }

    if (
      staffStore &&
      typeof staffStore.getSnapshot === "function" &&
      typeof staffStore.setAssignment === "function"
    ) {
      const snapshot = await staffStore.getSnapshot();
      const assignmentEntryIds = new Set(
        (Array.isArray(snapshot.assignments) ? snapshot.assignments : []).map(
          (record) => record.entryId
        )
      );
      for (const entry of futureEntries) {
        if (assignmentEntryIds.has(entry.id)) {
          await staffStore.setAssignment(entry.id, { status: "canceled" });
        }
      }
    }

    return updatedSource;
  }

  return {
    rescheduleRecurringOrderSeries,
    canGenerateRecurringOrderSeries,
    cancelRecurringOrderSeries,
    ensureAllRecurringOrderSeries,
    ensureRecurringOrderSeries,
    restoreRecurringOrderSeries,
    resetRecurringOrderSeries,
    stopRecurringOrderSeries,
    updateRecurringOrderSeriesFutureComment,
    updateRecurringOrderSeriesFutureAssignment,
    updateRecurringOrderSeriesFuturePrice,
  };
}

module.exports = {
  createAdminOrdersRecurringHelpers,
};
