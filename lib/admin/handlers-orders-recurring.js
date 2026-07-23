"use strict";

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

  function getSelectedDate(entry = {}) {
    const order = getOrderState(entry);
    const value = order.selectedDate || entry.selectedDate;
    return typeof normalizeAdminOrderDateInput === "function"
      ? normalizeAdminOrderDateInput(value)
      : normalizeString(value, 32);
  }

  function getSeriesId(entry = {}) {
    const order = getOrderState(entry);
    return normalizeString(
      order.recurringSeriesId ||
        order.recurringSourceRequestId ||
        entry.requestId ||
        entry.id,
      120
    );
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
    const value = Number(getOrderState(entry).recurringOccurrenceIndex);
    return Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
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
    return entries.filter((entry) => {
      if (!entry || !entry.id) return false;
      if (normalizeString(entry.id, 120) === sourceId) return true;
      const order = getOrderState(entry);
      return normalizeString(order.recurringSeriesId, 120) === normalizedSeriesId;
    });
  }

  async function migrateSeriesMetadata(quoteOpsLedger, sourceEntry, allEntries) {
    const entryById = getEntryById(allEntries);
    const { rootEntry, sourceOccurrenceIndex } = findSeriesRootAndIndex(sourceEntry, entryById);
    const sourceOrder = getOrderState(sourceEntry);
    const rootOrder = getOrderState(rootEntry);
    const seriesId = getSeriesId(sourceEntry);
    const frequency = normalizeString(sourceOrder.frequency || rootOrder.frequency, 40).toLowerCase();
    const anchorDate =
      normalizeString(sourceOrder.recurringAnchorDate || rootOrder.recurringAnchorDate, 32) ||
      getSelectedDate(rootEntry) ||
      getSelectedDate(sourceEntry);
    const sourceIndex = getOccurrenceIndex(sourceEntry);
    const occurrenceIndex = sourceIndex === null ? sourceOccurrenceIndex : sourceIndex;
    const occurrenceDate =
      normalizeString(sourceOrder.recurringOccurrenceDate, 32) ||
      (typeof addRecurringScheduleDate === "function" && occurrenceIndex > 0
        ? addRecurringScheduleDate(anchorDate, frequency, occurrenceIndex)
        : anchorDate);

    const updatedSource =
      (typeof quoteOpsLedger.updateOrderEntry === "function"
        ? await quoteOpsLedger.updateOrderEntry(sourceEntry.id, {
            recurringSeriesId: seriesId,
            recurringAnchorDate: anchorDate,
            recurringOccurrenceDate: occurrenceDate || getSelectedDate(sourceEntry),
            recurringOccurrenceIndex: occurrenceIndex,
          })
        : null) || sourceEntry;

    const seriesEntries = collectSeriesEntries(allEntries, seriesId, updatedSource);
    for (const entry of seriesEntries) {
      const order = getOrderState(entry);
      if (order.recurringOccurrenceDate && Number.isFinite(Number(order.recurringOccurrenceIndex))) {
        continue;
      }
      const chainMeta = findSeriesRootAndIndex(entry, entryById);
      const index = chainMeta.sourceOccurrenceIndex;
      const canonicalDate =
        index > 0 && typeof addRecurringScheduleDate === "function"
          ? addRecurringScheduleDate(anchorDate, frequency, index)
          : anchorDate;
      if (typeof quoteOpsLedger.updateOrderEntry === "function") {
        await quoteOpsLedger.updateOrderEntry(entry.id, {
          recurringSeriesId: seriesId,
          recurringAnchorDate: anchorDate,
          recurringOccurrenceDate: canonicalDate || getSelectedDate(entry),
          recurringOccurrenceIndex: index,
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

  async function copySeriesAssignment(staffStore, sourceEntryId, seriesEntries) {
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
    const sourceAssignment = assignmentByEntryId.get(sourceEntryId);
    if (
      !sourceAssignment ||
      sourceAssignment.status === "canceled" ||
      !Array.isArray(sourceAssignment.staffIds) ||
      sourceAssignment.staffIds.length === 0
    ) {
      return;
    }

    for (const entry of seriesEntries) {
      if (!entry || entry.id === sourceEntryId || assignmentByEntryId.has(entry.id)) continue;
      await staffStore.setAssignment(entry.id, {
        staffIds: sourceAssignment.staffIds,
        scheduleDate: "",
        scheduleTime: "",
        status: "planned",
        notes: "",
      });
    }
  }

  async function ensureRecurringOrderSeries({
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
    if (!frequency) return [];

    const allEntries = await quoteOpsLedger.listEntries({ limit: 5000 });
    const metadata = await migrateSeriesMetadata(quoteOpsLedger, sourceEntry, allEntries);
    const refreshedEntries = await quoteOpsLedger.listEntries({ limit: 5000 });
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
    const existingRequestIds = new Set(
      currentSeriesEntries.map((entry) => normalizeString(entry.requestId, 120)).filter(Boolean)
    );
    const submissions = buildRecurringOrderSeriesSubmissions(metadata.updatedSource, {
      frequency,
      currentOccurrenceDate: metadata.occurrenceDate,
      currentOccurrenceIndex: metadata.occurrenceIndex,
      recurringAnchorDate: metadata.anchorDate,
      horizonMonths,
      orderStatus: "scheduled",
    });
    const createdEntries = [];

    for (const submission of submissions) {
      const submissionOrder = getOrderState({
        payloadForRetry: submission.payloadForRetry,
      });
      const occurrenceDate = normalizeString(submissionOrder.recurringOccurrenceDate, 32);
      if (
        !occurrenceDate ||
        (canceledFromDate && occurrenceDate >= canceledFromDate) ||
        existingOccurrenceDates.has(occurrenceDate) ||
        existingRequestIds.has(normalizeString(submission.requestId, 120))
      ) {
        continue;
      }
      const entry = await quoteOpsLedger.recordSubmission(submission);
      if (!entry) continue;
      createdEntries.push(entry);
      currentSeriesEntries.push(entry);
      existingOccurrenceDates.add(occurrenceDate);
      existingRequestIds.add(normalizeString(submission.requestId, 120));
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
      orderedSeriesEntries
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

    const allEntries = await quoteOpsLedger.listEntries({ limit: 5000 });
    const entryById = getEntryById(allEntries);
    const groups = new Map();

    for (const entry of allEntries) {
      const order = getOrderState(entry);
      const frequency = normalizeString(order.frequency, 40).toLowerCase();
      const selectedDate = getSelectedDate(entry);
      if (!frequency || !selectedDate) continue;

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
      if (group.canceled || !group.legacy) continue;

      const activeEntries = group.entries
        .filter((entry) => {
          const status = normalizeString(getOrderState(entry).status, 40).toLowerCase();
          return status !== "canceled" && status !== "rescheduled";
        })
        .sort((left, right) => getSelectedDate(left).localeCompare(getSelectedDate(right)));
      if (activeEntries.length === 0) continue;

      const sourceEntry =
        activeEntries.find((entry) => getSelectedDate(entry) >= today) ||
        activeEntries[activeEntries.length - 1];
      try {
        const created = await ensureRecurringOrderSeries({
          quoteOpsLedger,
          sourceEntry,
          staffStore,
        });
        createdEntries.push(...created);
      } catch {
        // A malformed legacy series must not prevent the admin page from loading.
      }
    }

    return createdEntries;
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

    const allEntries = await quoteOpsLedger.listEntries({ limit: 5000 });
    const metadata = await migrateSeriesMetadata(quoteOpsLedger, sourceEntry, allEntries);
    const refreshedEntries = await quoteOpsLedger.listEntries({ limit: 5000 });
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

  async function resetRecurringOrderSeries({
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

    const allEntries = await quoteOpsLedger.listEntries({ limit: 5000 });
    const seriesId = getSeriesId(sourceEntry);
    const sourceEntryId = normalizeString(sourceEntry.id, 120);
    const sourceDate = getSelectedDate(sourceEntry);
    const futureEntries = collectSeriesEntries(allEntries, seriesId, sourceEntry).filter(
      (entry) =>
        normalizeString(entry.id, 120) !== sourceEntryId &&
        getOccurrenceDate(entry) > sourceDate
    );

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

    return (
      (await quoteOpsLedger.updateOrderEntry(sourceEntryId, {
        recurringSeriesId: seriesId,
        recurringAnchorDate: sourceDate,
        recurringOccurrenceDate: sourceDate,
        recurringOccurrenceIndex: 0,
        recurringNextEntryId: "",
        recurringGeneratedAt: "",
        recurringSeriesCanceledFromDate: "",
      })) || sourceEntry
    );
  }

  return {
    cancelRecurringOrderSeries,
    ensureAllRecurringOrderSeries,
    ensureRecurringOrderSeries,
    resetRecurringOrderSeries,
  };
}

module.exports = {
  createAdminOrdersRecurringHelpers,
};
