"use strict";

const crypto = require("crypto");
const { getAuditMetadata } = require("../admin-audit");
const { hasEntryOrderState } = require("../admin-order-state");
const { buildRecurringEntryId, getRecurringIdentity, matchesRecurringIdentity } = require("./recurring-identity");
const { applyScheduleChange, validateSchedulePlan, scheduleGuard, seriesId, scheduleError } = require("./recurring-schedule");
const { normalizeEnglishAddressLabel } = require("../address-format");
const { projectOrderListEntry } = require("./order-list");
const { HIDDEN_ENTRY_KINDS: hiddenEntryKinds } = require("./entry-kinds");
const { projectAdminDirectoryEntry } = require("./admin-directory");
const { projectAdminMenuEntry } = require("./admin-menu");
const { projectWorkspaceListEntry } = require("./workspace-list");
const { projectAccountListEntry } = require("../account/order-list");
const { projectAccountCalendarEntry } = require("../account/calendar-list");
const { isFutureOrder, sameClient, clientKeys, nextCleaningTaskReason, getRawTasks, taskKind,
  chicagoDateTime, applyTaskChanges } = require("./task-policy");

const HIDDEN_ENTRY_KINDS = new Set(hiddenEntryKinds);

function getQuoteOpsSearchHaystack(entry) {
  const payload = entry && entry.payloadForRetry && typeof entry.payloadForRetry === "object"
    ? entry.payloadForRetry
    : {};
  const adminLead = payload.adminLead && typeof payload.adminLead === "object"
    ? payload.adminLead
    : {};
  const taskText = Array.isArray(adminLead.tasks)
    ? adminLead.tasks.map((task) => `${task && task.title ? task.title : ""} ${task && task.assigneeName ? task.assigneeName : ""}`).join(" ")
    : "";
  return [
    entry.requestId,
    entry.customerName,
    entry.customerPhone,
    entry.customerEmail,
    entry.fullAddress,
    entry.contactId,
    entry.serviceName,
    entry.serviceType,
    entry.source,
    entry.code,
    entry.errorMessage,
    taskText,
  ]
    .join(" ")
    .toLowerCase();
}

function filterQuoteOpsEntries(entries = [], filters = {}, normalizeString) {
  const status = normalizeString(filters.status, 32).toLowerCase();
  const serviceType = normalizeString(filters.serviceType, 32).toLowerCase();
  const leadStatus = normalizeString(filters.leadStatus, 40).toLowerCase();
  const managerId = normalizeString(filters.managerId, 120);
  const query = normalizeString(filters.q, 200).toLowerCase();
  const limitValue = Number.isFinite(filters.limit) ? filters.limit : entries.length;

  return entries
    .filter((entry) => {
      const kind = normalizeString(entry && entry.kind, 64);
      const payload = entry && entry.payloadForRetry && typeof entry.payloadForRetry === "object" ? entry.payloadForRetry : {};
      const adminLead = payload.adminLead && typeof payload.adminLead === "object" ? payload.adminLead : {};
      const effectiveLeadStatus =
        normalizeString(adminLead.status, 40).toLowerCase() ||
        (hasEntryOrderState(entry) ? "confirmed" : "new");
      const effectiveManagerId = normalizeString(adminLead.managerId, 120);
      // Deleting an automated visit leaves a ledger shell, not a new customer lead.
      if (
        filters.excludeRemovedRecurringOrders &&
        entry.code === "RECURRING_ORDER_CREATED" &&
        !hasEntryOrderState(entry) &&
        effectiveLeadStatus === "new"
      ) return false;
      if (HIDDEN_ENTRY_KINDS.has(kind) && !filters.includeHidden) return false;
      if (status && status !== "all" && entry.status !== status) return false;
      if (serviceType && serviceType !== "all" && entry.serviceType !== serviceType) return false;
      if (leadStatus && leadStatus !== "all" && effectiveLeadStatus !== leadStatus) return false;
      if (managerId && effectiveManagerId !== managerId) return false;
      if (query && !getQuoteOpsSearchHaystack(entry).includes(query)) return false;
      return true;
    })
    .slice(0, Math.max(0, limitValue));
}

function selectPreferredEntryByRequestId(entries = [], requestId, normalizeString, identity = null) {
  const normalizedRequestId = normalizeString(requestId, 120);
  if (!normalizedRequestId) return null;

  return (Array.isArray(entries) ? entries : [])
    .filter((entry) => normalizeString(entry && entry.requestId, 120) === normalizedRequestId && matchesRecurringIdentity(entry, identity))
    .sort((left, right) => {
      const rightOrderScore = hasEntryOrderState(right) ? 1 : 0;
      const leftOrderScore = hasEntryOrderState(left) ? 1 : 0;
      if (rightOrderScore !== leftOrderScore) {
        return rightOrderScore - leftOrderScore;
      }

      const rightUpdatedAt = Date.parse((right && (right.updatedAt || right.createdAt)) || "");
      const leftUpdatedAt = Date.parse((left && (left.updatedAt || left.createdAt)) || "");
      if (Number.isFinite(rightUpdatedAt) && Number.isFinite(leftUpdatedAt) && rightUpdatedAt !== leftUpdatedAt) {
        return rightUpdatedAt - leftUpdatedAt;
      }

      return normalizeString((right && right.id) || "", 120).localeCompare(
        normalizeString((left && left.id) || "", 120),
        "en"
      );
    })[0] || null;
}

function createQuoteOpsStore(deps = {}) {
  const {
    QUOTE_OPS_LEDGER_LIMIT,
    applyPaymentEntryUpdates,
    applyLeadEntryUpdates,
    applyClientEntryUpdates,
    applyOrderEntryUpdates,
    createSupabaseQuoteOpsClient,
    env = process.env,
    fetch = global.fetch,
    normalizeString,
    orderStore = null,
  } = deps;

  async function performQuoteOpsRetry(entry, options = {}) {
    if (!entry) {
      return {
        ok: false,
        status: 404,
        code: "ENTRY_NOT_FOUND",
        message: "Quote entry was not found.",
      };
    }

    if (!entry.payloadForRetry) {
      return {
        ok: false,
        status: 400,
        code: "RETRY_UNAVAILABLE",
        message: "Retry is not available for this quote entry.",
      };
    }

    function normalizeQuoteOpsStatus(ok, warnings) {
      if (!ok) return "error";
      return Array.isArray(warnings) && warnings.length > 0 ? "warning" : "success";
    }

    let leadConnector;
    try {
      leadConnector = options.getLeadConnectorClient();
    } catch (error) {
      const failureMessage = normalizeString(error && error.message ? error.message : "Quote retry is unavailable.", 200);
      const retryTimestamp = new Date().toISOString();
      entry.retryCount += 1;
      entry.lastRetryAt = retryTimestamp;
      entry.lastRetryStatus = "error";
      entry.lastRetryMessage = failureMessage;
      entry.updatedAt = retryTimestamp;
      entry.retryHistory.unshift({
        at: retryTimestamp,
        status: "error",
        code: "CLIENT_INIT_ERROR",
        message: failureMessage,
      });
      entry.retryHistory = entry.retryHistory.slice(0, 10);
      return {
        ok: false,
        status: 503,
        code: "CLIENT_INIT_ERROR",
        message: failureMessage,
      };
    }

    const submittedAt = new Date().toISOString();
    const retryRequestId = normalizeString(`${entry.requestId || "quote"}-retry-${Date.now()}`, 120);
    const result = await leadConnector.submitQuoteSubmission({
      ...entry.payloadForRetry,
      requestId: retryRequestId,
      submittedAt,
      userAgent: normalizeString(options.userAgent || "Admin retry", 180),
    });

    const retryTimestamp = new Date().toISOString();
    const retryStatus = normalizeQuoteOpsStatus(Boolean(result.ok), result.warnings);
    entry.retryCount += 1;
    entry.lastRetryAt = retryTimestamp;
    entry.lastRetryStatus = retryStatus;
    entry.lastRetryMessage = normalizeString(
      result.ok ? "CRM retry completed." : result.message || "CRM retry failed.",
      300
    );
    entry.updatedAt = retryTimestamp;
    entry.retryHistory.unshift({
      at: retryTimestamp,
      status: retryStatus,
      code: normalizeString(result.code || "", 80),
      message: entry.lastRetryMessage,
    });
    entry.retryHistory = entry.retryHistory.slice(0, 10);

    if (result.ok) {
      entry.status = retryStatus;
      entry.httpStatus = Number(result.status) || entry.httpStatus;
      entry.code = normalizeString(result.code || "OK", 80);
      entry.retryable = Boolean(result.retryable);
      entry.warnings = Array.isArray(result.warnings) ? result.warnings.map((item) => normalizeString(item, 120)).filter(Boolean) : [];
      entry.errorMessage = normalizeString(result.warningMessage || "", 300);
      entry.contactId = normalizeString(result.contactId || entry.contactId, 120);
      entry.noteCreated = Boolean(result.noteCreated);
      entry.opportunityCreated = Boolean(result.opportunityCreated);
      entry.customFieldsUpdated = Boolean(result.customFieldsUpdated);
      entry.usedExistingContact = Boolean(result.usedExistingContact);
    } else {
      entry.httpStatus = Number(result.status) || entry.httpStatus;
      entry.code = normalizeString(result.code || entry.code || "RETRY_FAILED", 80);
      entry.retryable = Boolean(result.retryable);
      entry.errorMessage = normalizeString(result.message || "CRM retry failed.", 300);
    }

    return result;
  }

  function createQuoteOpsLedger(limit = QUOTE_OPS_LEDGER_LIMIT) {
    const entries = [];
    const entryById = new Map();

    function trim() {
      while (entries.length > limit) {
        const removed = entries.pop();
        if (removed) {
          entryById.delete(removed.id);
        }
      }
    }

    function normalizeQuoteOpsStatus(ok, warnings) {
      if (!ok) return "error";
      return Array.isArray(warnings) && warnings.length > 0 ? "warning" : "success";
    }

    function createBaseEntry(input = {}) {
      const timestamp = new Date().toISOString();
      const recurringRequestId = input.code === "RECURRING_ORDER_CREATED" ? normalizeString(input.requestId, 120) : "";
      return {
        id: recurringRequestId ? buildRecurringEntryId(input) : crypto.randomUUID(),
        kind: normalizeString(input.kind, 64) || "quote_submission",
        status: normalizeQuoteOpsStatus(Boolean(input.ok), input.warnings),
        createdAt: timestamp,
        updatedAt: timestamp,
        requestId: normalizeString(input.requestId, 120),
        sourceRoute: normalizeString(input.sourceRoute, 120),
        source: normalizeString(input.source, 120),
        customerName: normalizeString(input.customerName, 250),
        customerPhone: normalizeString(input.customerPhone, 80),
        customerEmail: normalizeString(input.customerEmail, 250),
        serviceType: normalizeString(input.serviceType, 40),
        serviceName: normalizeString(input.serviceName, 120),
        totalPrice: Number.isFinite(input.totalPrice) ? Number(input.totalPrice) : 0,
        totalPriceCents: Number.isFinite(input.totalPriceCents) ? Number(input.totalPriceCents) : 0,
        selectedDate: normalizeString(input.selectedDate, 32),
        selectedTime: normalizeString(input.selectedTime, 32),
        fullAddress: normalizeEnglishAddressLabel(input.fullAddress, 500),
        httpStatus: Number.isFinite(input.httpStatus) ? input.httpStatus : 0,
        code: normalizeString(input.code, 80),
        retryable: Boolean(input.retryable),
        warnings: Array.isArray(input.warnings) ? input.warnings.map((item) => normalizeString(item, 120)).filter(Boolean) : [],
        errorMessage: normalizeString(input.errorMessage, 300),
        contactId: normalizeString(input.contactId, 120),
        noteCreated: Boolean(input.noteCreated),
        opportunityCreated: Boolean(input.opportunityCreated),
        customFieldsUpdated: Boolean(input.customFieldsUpdated),
        usedExistingContact: Boolean(input.usedExistingContact),
        retryCount: 0,
        lastRetryAt: "",
        lastRetryStatus: "",
        lastRetryMessage: "",
        retryHistory: [],
        payloadForRetry: input.payloadForRetry || null,
      };
    }

    function rememberEntry(entry) {
      const index = entries.findIndex(candidate => candidate.id === entry.id);
      if (index === -1) entries.unshift(entry);
      else entries[index] = entry;
      entryById.set(entry.id, entry);
      trim();
      return entry;
    }

    return {
      createEntry: createBaseEntry,
      rememberEntry,
      recordSubmission(input = {}) {
        return rememberEntry(createBaseEntry(input));
      },
      deleteEntry(entryId) {
        const normalizedEntryId = normalizeString(entryId, 120);
        const entry = entryById.get(normalizedEntryId);
        if (!entry) return false;

        entryById.delete(normalizedEntryId);
        const index = entries.findIndex((candidate) => candidate.id === normalizedEntryId);
        if (index !== -1) {
          entries.splice(index, 1);
        }
        return true;
      },
      getEntry(entryId) {
        return entryById.get(normalizeString(entryId, 120)) || null;
      },
      findEntryByRequestId(requestId, identity) {
        return selectPreferredEntryByRequestId(entries, requestId, normalizeString, identity);
      },
      listEntries(filters = {}) {
        return filterQuoteOpsEntries(entries, filters, normalizeString);
      },
      updateOrderEntry(entryId, updates = {}) {
        const entry = entryById.get(normalizeString(entryId, 120));
        if (!entry) return null;
        return applyOrderEntryUpdates(entry, updates);
      },
      updateLeadEntry(entryId, updates = {}) {
        const entry = entryById.get(normalizeString(entryId, 120));
        if (!entry) return null;
        return typeof applyLeadEntryUpdates === "function" ? applyLeadEntryUpdates(entry, updates) : entry;
      },
      updateClientEntry(entryId, updates = {}) {
        const entry = entryById.get(normalizeString(entryId, 120));
        if (!entry) return null;
        return typeof applyClientEntryUpdates === "function" ? applyClientEntryUpdates(entry, updates) : entry;
      },
      recordPaymentEvent(requestId, updates = {}) {
        const entry = this.findEntryByRequestId(requestId);
        if (!entry) return null;
        return typeof applyPaymentEntryUpdates === "function" ? applyPaymentEntryUpdates(entry, updates) : entry;
      },
      buildCsv(entriesToExport = []) {
        const headers = [
          "id",
          "status",
          "created_at",
          "updated_at",
          "request_id",
          "source_route",
          "source",
          "customer_name",
          "customer_phone",
          "customer_email",
          "service_type",
          "service_name",
          "total_price",
          "selected_date",
          "selected_time",
          "full_address",
          "http_status",
          "code",
          "retryable",
          "warnings",
          "error_message",
          "contact_id",
          "note_created",
          "opportunity_created",
          "custom_fields_updated",
          "used_existing_contact",
          "retry_count",
          "last_retry_at",
          "last_retry_status",
          "last_retry_message",
        ];
        const csvEscape = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
        const lines = [headers.map(csvEscape).join(",")];

        for (const entry of entriesToExport) {
          lines.push(
            [
              entry.id,
              entry.status,
              entry.createdAt,
              entry.updatedAt,
              entry.requestId,
              entry.sourceRoute,
              entry.source,
              entry.customerName,
              entry.customerPhone,
              entry.customerEmail,
              entry.serviceType,
              entry.serviceName,
              entry.totalPrice,
              entry.selectedDate,
              entry.selectedTime,
              entry.fullAddress,
              entry.httpStatus,
              entry.code,
              entry.retryable,
              entry.warnings.join("|"),
              entry.errorMessage,
              entry.contactId,
              entry.noteCreated,
              entry.opportunityCreated,
              entry.customFieldsUpdated,
              entry.usedExistingContact,
              entry.retryCount,
              entry.lastRetryAt,
              entry.lastRetryStatus,
              entry.lastRetryMessage,
            ]
              .map(csvEscape)
              .join(",")
          );
        }

        return lines.join("\n");
      },
      async retrySubmission(entryId, options = {}) {
        const entry = entryById.get(normalizeString(entryId, 120));
        return performQuoteOpsRetry(entry, options);
      },
    };
  }

  const localLedger = createQuoteOpsLedger(QUOTE_OPS_LEDGER_LIMIT);
  const supabaseClient =
    typeof createSupabaseQuoteOpsClient === "function"
      ? createSupabaseQuoteOpsClient({
          env,
          fetch,
        })
      : null;
  const remoteEnabled = Boolean(supabaseClient && typeof supabaseClient.isConfigured === "function" && supabaseClient.isConfigured());
  const diagnostics = {
    mode: remoteEnabled ? "supabase" : "memory",
    configured: remoteEnabled,
    remoteStatus: remoteEnabled ? "configured" : "memory",
    url:
      supabaseClient && supabaseClient.config && supabaseClient.config.url
        ? normalizeString(supabaseClient.config.url, 200)
        : "",
    tableName:
      supabaseClient && supabaseClient.config && supabaseClient.config.tableName
        ? normalizeString(supabaseClient.config.tableName, 120)
        : "",
    limit: QUOTE_OPS_LEDGER_LIMIT,
    lastReadSource: remoteEnabled ? "not-yet-read" : "memory",
    lastReadAt: "",
    lastReadError: "",
    lastWriteAt: "",
    lastWriteError: "",
    lastDeleteAt: "",
    lastDeleteError: "",
    lastSyncAt: "",
    lastSyncError: "",
    lastSyncOperation: "",
  };

  function getTimestamp() {
    return new Date().toISOString();
  }

  function markRemoteSuccess(operation, readSource = diagnostics.lastReadSource) {
    if (!remoteEnabled) return;
    diagnostics.remoteStatus = "healthy";
    diagnostics.lastSyncAt = getTimestamp();
    diagnostics.lastSyncError = "";
    diagnostics.lastSyncOperation = normalizeString(operation, 80);
    if (readSource) {
      diagnostics.lastReadSource = normalizeString(readSource, 80);
    }
  }

  function markRemoteFailure(operation, error, readSource = diagnostics.lastReadSource || "memory-fallback") {
    if (!remoteEnabled) return;
    diagnostics.remoteStatus = "fallback";
    diagnostics.lastSyncAt = getTimestamp();
    diagnostics.lastSyncError = normalizeString(error && error.message ? error.message : "Supabase sync failed.", 300);
    diagnostics.lastSyncOperation = normalizeString(operation, 80);
    diagnostics.lastReadSource = normalizeString(readSource, 80);
  }

  async function syncOrderStoreEntry(entry, source = "quote-ops-sync") {
    if (!orderStore || typeof orderStore.upsertEntry !== "function" || !entry) return;
    try {
      await orderStore.upsertEntry(entry, source);
    } catch {}
  }

  async function removeOrderStoreEntry(entryId, source = "quote-ops-delete") {
    if (!orderStore || typeof orderStore.deleteEntry !== "function" || !entryId) return;
    try {
      await orderStore.deleteEntry(entryId, source);
    } catch {}
  }

  async function listTaskAutomationEntries(clientEntry = null) {
    if (!remoteEnabled) return localLedger.listEntries({ includeHidden: true, limit: QUOTE_OPS_LEDGER_LIMIT });
    // Do not fall back to a partial memory ledger when deciding whether a client is booked.
    if (typeof supabaseClient.fetchTaskAutomationEntries !== "function") throw new Error("Task context query unavailable");
    const keys = clientEntry ? clientKeys(clientEntry) : null;
    if (keys && !keys.length) return [];
    return supabaseClient.fetchTaskAutomationEntries(chicagoDateTime().slice(0, 10), keys ? {
      phones: keys.filter((key) => key.startsWith("phone:")).map((key) => key.slice(6)),
      ids: keys.filter((key) => key.startsWith("id:")).map((key) => key.slice(3)),
    } : null);
  }

  async function closeClientFollowupTasks(orderEntry) {
    if (!isFutureOrder(orderEntry)) return;
    try {
      const candidates = (await listTaskAutomationEntries(orderEntry)).filter((entry) => sameClient(orderEntry, entry) &&
        getRawTasks(entry).some((task) => task.status === "open" && taskKind(task) === "post-completion-followup"));
      for (const candidate of candidates) {
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const entry = remoteEnabled ? await supabaseClient.fetchEntryById(candidate.id) : localLedger.getEntry(candidate.id);
          if (!entry || !sameClient(orderEntry, entry)) break;
          const expectedUpdatedAt = entry.updatedAt;
          const changes = getRawTasks(entry).filter((task) => task.status === "open" && taskKind(task) === "post-completion-followup")
            .map((task) => ({ entryId: entry.id, taskId: task.id, status: "completed", reason: "future-order-exists" }));
          if (!applyTaskChanges(entry, changes)) break;
          if (!remoteEnabled || await supabaseClient.updateTaskPayload(entry, expectedUpdatedAt)) break;
          if (attempt === 2) throw new Error("Concurrent task update; reconciliation needs retry");
        }
      }
    } catch (error) {
      markRemoteFailure("close-booked-client-followups", error);
    }
  }

  const leadUpdateQueues = new Map();
  const memoryTrash = new Map();

  function assertDurableStorage() {
    if (!remoteEnabled && (env.NODE_ENV === "production" || env.RENDER === "true")) {
      throw new Error("Database storage is required; changes were not saved");
    }
  }

  async function readForWrite(entryId) {
    assertDurableStorage();
    if (!remoteEnabled) return localLedger.getEntry(entryId);
    try {
      const entry = await supabaseClient.fetchEntryById(entryId);
      markRemoteSuccess("fetch-entry-for-write");
      return entry ? structuredClone(entry) : null;
    } catch (error) {
      markRemoteFailure("fetch-entry-for-write", error);
      throw error;
    }
  }

  function rememberTrash(entry, scope, liveUpdatedAt = null) {
    const item = { id: crypto.randomUUID(), entry_id: entry.id, scope,
      deleted_at: new Date().toISOString(), actor: getAuditMetadata().actor,
      row_data: structuredClone(entry), live_updated_at: liveUpdatedAt, restored_at: null };
    memoryTrash.set(item.id, item);
  }

  async function persistUpdate(entry, expectedUpdatedAt, operation) {
    if (remoteEnabled) {
      try {
        if (typeof supabaseClient.updateEntryIfUnchanged === "function") {
          if (!expectedUpdatedAt || !await supabaseClient.updateEntryIfUnchanged(entry, expectedUpdatedAt)) {
            throw Object.assign(new Error("Record changed or was removed; reload before saving"), { code: "40001" });
          }
        } else {
          // Custom adapters must provide the same durable acknowledgement contract.
          await supabaseClient.upsertEntry(entry);
        }
        diagnostics.lastWriteAt = getTimestamp();
        diagnostics.lastWriteError = "";
        markRemoteSuccess(operation);
      } catch (error) {
        diagnostics.lastWriteAt = getTimestamp();
        diagnostics.lastWriteError = normalizeString(error.message, 300);
        markRemoteFailure(operation, error);
        throw error;
      }
    }
    localLedger.rememberEntry(entry);
    return entry;
  }
  async function serializeLeadUpdate(entryId, update) {
    const previous = leadUpdateQueues.get(entryId) || Promise.resolve();
    const pending = previous.catch(() => {}).then(update);
    leadUpdateQueues.set(entryId, pending);
    try { return await pending; }
    finally { if (leadUpdateQueues.get(entryId) === pending) leadUpdateQueues.delete(entryId); }
  }

  async function recordRecurringSubmission(input) {
    const requestId = normalizeString(input.requestId, 120);
    if (!requestId) throw new Error("A recurring occurrence requires a request ID.");
    const identity = getRecurringIdentity(input);
    if (!remoteEnabled) {
      const currentSchedule = scheduleGuard(localLedger.listEntries({ includeHidden: true, limit: QUOTE_OPS_LEDGER_LIMIT }), seriesId(input));
      if (JSON.stringify(currentSchedule) !== JSON.stringify(input.recurringSourceGuard?.schedule || [])) {
        throw scheduleError("Расписание серии изменилось. Устаревшая генерация остановлена.");
      }
      const existing = localLedger.findEntryByRequestId(requestId, identity);
      if (existing) return existing.id === input.recurringSourceGuard?.entryId ? null : existing;
      const entry = localLedger.recordSubmission(input);
      await syncOrderStoreEntry(entry, "record-submission");
      await closeClientFollowupTasks(entry);
      return entry;
    }
    try {
      // Reuse legacy UUIDs too; an incomplete read must never authorize another insert.
      const existing = await supabaseClient.fetchEntryByRequestId(requestId, identity);
      if (existing) return existing.id === input.recurringSourceGuard?.entryId ? null : existing;
      // The stable primary key also arbitrates concurrent inserts across app instances.
      if (!input.recurringSourceGuard) throw new Error("Recurring source guard is required.");
      const result = await supabaseClient.insertRecurringEntry(localLedger.createEntry(input), input.recurringSourceGuard);
      if (!result.entry) return null;
      localLedger.rememberEntry(result.entry);
      diagnostics.lastWriteAt = getTimestamp();
      diagnostics.lastWriteError = "";
      markRemoteSuccess("insert-recurring-occurrence");
      if (result.inserted) {
        await syncOrderStoreEntry(result.entry, "record-submission");
        await closeClientFollowupTasks(result.entry);
      }
      return result.entry;
    } catch (error) {
      diagnostics.lastWriteAt = getTimestamp();
      diagnostics.lastWriteError = normalizeString(error && error.message, 300);
      markRemoteFailure("insert-recurring-occurrence", error);
      throw error;
    }
  }

  return {
    mode: remoteEnabled ? "supabase" : "memory",
    getDiagnostics() {
      return { ...diagnostics };
    },
    async probeRemoteHealth() {
      if (!remoteEnabled) {
        diagnostics.lastReadSource = "memory";
        return { ...diagnostics };
      }

      try {
        await supabaseClient.fetchEntries(1);
        diagnostics.lastReadAt = getTimestamp();
        diagnostics.lastReadError = "";
        markRemoteSuccess("startup-probe", "supabase");
      } catch (error) {
        diagnostics.lastReadAt = getTimestamp();
        diagnostics.lastReadError = normalizeString(error && error.message ? error.message : "Supabase read failed.", 300);
        markRemoteFailure("startup-probe", error, "memory-fallback");
      }

      return { ...diagnostics };
    },
    buildCsv(entriesToExport = []) {
      return localLedger.buildCsv(entriesToExport);
    },
    async recordSubmission(input = {}) {
      assertDurableStorage();
      if (input.code === "RECURRING_ORDER_CREATED") return recordRecurringSubmission(input);
      const entry = localLedger.createEntry(input);
      if (!remoteEnabled) {
        localLedger.rememberEntry(entry);
        await syncOrderStoreEntry(entry, "record-submission");
        await closeClientFollowupTasks(entry);
        return entry;
      }
      try {
        await supabaseClient.upsertEntry(entry);
        diagnostics.lastWriteAt = getTimestamp();
        diagnostics.lastWriteError = "";
        markRemoteSuccess("upsert-entry");
      } catch (error) {
        diagnostics.lastWriteAt = getTimestamp();
        diagnostics.lastWriteError = normalizeString(error && error.message ? error.message : "Supabase write failed.", 300);
        markRemoteFailure("upsert-entry", error);
        throw error;
      }
      localLedger.rememberEntry(entry);
      await syncOrderStoreEntry(entry, "record-submission");
      await closeClientFollowupTasks(entry);
      return entry;
    },
    listTaskAutomationEntries,
    async listWorkspaceListEntries() {
      // Display DTOs never enter the full-record cache used by guarded saves.
      try {
        return remoteEnabled ? await supabaseClient.fetchWorkspaceListEntries()
          : localLedger.listEntries({ includeHidden: true, limit: Number.MAX_SAFE_INTEGER }).map(projectWorkspaceListEntry);
      } catch (error) {
        markRemoteFailure("fetch-workspace-list", error, "supabase");
        throw error;
      }
    },
    async listAdminMenuEntries() {
      try {
        const entries = remoteEnabled ? await supabaseClient.fetchAdminMenuEntries()
          : localLedger.listEntries({ includeHidden: true, limit: Number.MAX_SAFE_INTEGER }).map(projectAdminMenuEntry);
        return filterQuoteOpsEntries(entries, {}, normalizeString);
      } catch (error) {
        markRemoteFailure("fetch-admin-menu", error, "supabase");
        throw error;
      }
    },
    async listAdminDirectoryEntries(options = {}) {
      // Display-only DTOs must never populate the full-record mutation cache.
      try {
        const entries = remoteEnabled ? await supabaseClient.fetchAdminDirectoryEntries(options)
          : localLedger.listEntries({ includeHidden: true,
            limit: options.includeClients ? Number.MAX_SAFE_INTEGER : options.limit })
            .map(entry => projectAdminDirectoryEntry(entry, options.includeClients));
        diagnostics.lastReadSource = remoteEnabled ? "supabase" : "memory";
        diagnostics.lastReadAt = getTimestamp();
        diagnostics.lastReadError = "";
        if (remoteEnabled) markRemoteSuccess("fetch-admin-directory", "supabase");
        return entries;
      } catch (error) {
        diagnostics.lastReadAt = getTimestamp();
        diagnostics.lastReadError = normalizeString(error.message || "Client list read failed.", 300);
        markRemoteFailure("fetch-admin-directory", error, "supabase");
        error.adminClientReadUnavailable = true;
        throw error;
      }
    },
    async listDashboardEntries() {
      // Keep standalone tasks and legacy kinds. This reader is complete, not the old 1000-row prefix.
      const entries = remoteEnabled
        ? await supabaseClient.fetchOrderListEntries()
        : localLedger.listEntries({ includeHidden: true }).map(entry => projectOrderListEntry(entry));
      return entries;
    },
    async listDashboardDetailEntries(entryIds = []) {
      // Reuse the strict, bounded full-row reader, including its missing-ID checks.
      return this.listClientDetailEntries(entryIds);
    },
    async listClientDetailEntries(entryIds = []) {
      try {
        const ids = Array.from(new Set(entryIds));
        const entries = [];
        for (let index = 0; index < ids.length; index += 75) {
          const batch = ids.slice(index, index + 75);
          const rows = remoteEnabled
            ? await supabaseClient.fetchEntriesByIds(batch)
            : batch.map(id => localLedger.getEntry(id)).filter(Boolean);
          const expected = new Set(batch);
          for (const entry of rows) {
            if (!expected.delete(entry.id)) throw new Error("Invalid client detail response");
            entries.push(entry);
          }
          if (expected.size) throw new Error("Incomplete client detail response");
        }
        return entries;
      } catch (error) {
        error.adminClientReadUnavailable = true;
        throw error;
      }
    },
    async listOrderListEntries(options = {}) {
      // Never replace a complete list with a partial in-memory fallback on a read failure.
      try {
        const entries = remoteEnabled
          ? await supabaseClient.fetchOrderListEntries(options.includePayroll ? options : { ...options, excludeTechnicalEntries: true })
          : localLedger.listEntries({ includeHidden: true }).map(entry => projectOrderListEntry(entry, options));
        diagnostics.lastReadSource = remoteEnabled ? "supabase" : "memory";
        diagnostics.lastReadAt = getTimestamp();
        diagnostics.lastReadError = "";
        if (remoteEnabled) markRemoteSuccess("fetch-order-list", "supabase");
        return filterQuoteOpsEntries(entries, {}, normalizeString);
      } catch (error) {
        diagnostics.lastReadAt = getTimestamp();
        diagnostics.lastReadError = normalizeString(error.message || "Order list read failed.", 300);
        markRemoteFailure("fetch-order-list", error, "supabase");
        error.orderListUnavailable = true;
        throw error;
      }
    },
    async listAllEntries(options = {}) {
      if (!remoteEnabled) return localLedger.listEntries({ includeHidden: true });
      // Series generation must stop on an incomplete read, never regenerate from a memory fallback.
      return supabaseClient.fetchAllEntries(options);
    },
    async listEntries(filters = {}) {
      if (!remoteEnabled) {
        diagnostics.lastReadSource = "memory";
        diagnostics.lastReadAt = getTimestamp();
        diagnostics.lastReadError = "";
        return localLedger.listEntries(filters);
      }
      try {
        const remoteEntries = await supabaseClient.fetchEntries(
          Number.isFinite(filters.limit) ? filters.limit : QUOTE_OPS_LEDGER_LIMIT
        );
        diagnostics.lastReadSource = "supabase";
        diagnostics.lastReadAt = getTimestamp();
        diagnostics.lastReadError = "";
        markRemoteSuccess("fetch-entries", "supabase");
        return filterQuoteOpsEntries(remoteEntries, filters, normalizeString);
      } catch (error) {
        diagnostics.lastReadSource = "memory-fallback";
        diagnostics.lastReadAt = getTimestamp();
        diagnostics.lastReadError = normalizeString(error && error.message ? error.message : "Supabase read failed.", 300);
        markRemoteFailure("fetch-entries", error, "memory-fallback");
        return localLedger.listEntries(filters);
      }
    },
    async listAccountEntriesByIds(entryIds = []) {
      const ids = Array.from(new Set(entryIds.map(id => normalizeString(id, 120)).filter(Boolean)));
      if (!remoteEnabled) return ids.map(id => localLedger.getEntry(id)).filter(Boolean).map(projectAccountListEntry);
      // Read-only summaries never enter the full-record cache or fall back to a partial cache.
      return supabaseClient.fetchAccountEntriesByIds(ids);
    },
    async listAccountCalendarEntriesByIds(entryIds = []) {
      const ids = Array.from(new Set(entryIds.map(id => normalizeString(id, 120)).filter(Boolean)));
      if (!remoteEnabled) return ids.map(id => localLedger.getEntry(id)).filter(Boolean).map(projectAccountCalendarEntry);
      if (typeof supabaseClient.fetchAccountCalendarEntriesByIds === "function") return supabaseClient.fetchAccountCalendarEntriesByIds(ids);
      return (await supabaseClient.fetchAccountEntriesByIds(ids)).map(projectAccountCalendarEntry);
    },
    async listEntriesByIds(entryIds = []) {
      const normalizedIds = Array.from(new Set(
        (Array.isArray(entryIds) ? entryIds : [])
          .map((entryId) => normalizeString(entryId, 120))
          .filter(Boolean)
      ));
      if (!normalizedIds.length) return [];
      if (!remoteEnabled || typeof supabaseClient.fetchEntriesByIds !== "function") {
        return normalizedIds.map((entryId) => localLedger.getEntry(entryId)).filter(Boolean);
      }
      try {
        const remoteEntries = await supabaseClient.fetchEntriesByIds(normalizedIds);
        diagnostics.lastReadSource = "supabase-entry-ids";
        diagnostics.lastReadAt = getTimestamp();
        diagnostics.lastReadError = "";
        markRemoteSuccess("fetch-entry-ids", "supabase-entry-ids");
        return remoteEntries;
      } catch (error) {
        diagnostics.lastReadSource = "memory-fallback";
        diagnostics.lastReadAt = getTimestamp();
        diagnostics.lastReadError = normalizeString(
          error && error.message ? error.message : "Supabase entry ID read failed.",
          300
        );
        markRemoteFailure("fetch-entry-ids", error, "memory-fallback");
        return normalizedIds.map((entryId) => localLedger.getEntry(entryId)).filter(Boolean);
      }
    },
    async listReminderEntries({ startDate = "", endDate = "", limit = 1000 } = {}) {
      const normalizedStartDate = normalizeString(startDate, 32);
      const normalizedEndDate = normalizeString(endDate, 32);
      const normalizedLimit = Math.max(1, Math.min(Number(limit) || 1000, 1000));
      if (!remoteEnabled || typeof supabaseClient.fetchEntriesBySelectedDateRange !== "function") {
        return localLedger.listEntries({ limit: normalizedLimit }).filter((entry) => {
          const selectedDate = normalizeString(entry && entry.selectedDate, 32);
          return selectedDate >= normalizedStartDate && selectedDate <= normalizedEndDate;
        });
      }
      try {
        const remoteEntries = await supabaseClient.fetchEntriesBySelectedDateRange(
          normalizedStartDate,
          normalizedEndDate,
          normalizedLimit
        );
        diagnostics.lastReadSource = "supabase-reminder-range";
        diagnostics.lastReadAt = getTimestamp();
        diagnostics.lastReadError = "";
        markRemoteSuccess("fetch-reminder-range", "supabase-reminder-range");
        return remoteEntries;
      } catch (error) {
        diagnostics.lastReadSource = "memory-fallback";
        diagnostics.lastReadAt = getTimestamp();
        diagnostics.lastReadError = normalizeString(error && error.message ? error.message : "Supabase reminder read failed.", 300);
        markRemoteFailure("fetch-reminder-range", error, "memory-fallback");
        return localLedger.listEntries({ limit: normalizedLimit }).filter((entry) => {
          const selectedDate = normalizeString(entry && entry.selectedDate, 32);
          return selectedDate >= normalizedStartDate && selectedDate <= normalizedEndDate;
        });
      }
    },
    async getEntry(entryId, { allowMemoryFallback = true } = {}) {
      const normalizedEntryId = normalizeString(entryId, 120);
      if (!normalizedEntryId) return null;
      if (!remoteEnabled) {
        return localLedger.getEntry(normalizedEntryId);
      }
      try {
        const remoteEntry = await supabaseClient.fetchEntryById(normalizedEntryId);
        markRemoteSuccess("fetch-entry");
        if (remoteEntry || !allowMemoryFallback) return remoteEntry;
      } catch (error) {
        markRemoteFailure("fetch-entry", error);
        if (!allowMemoryFallback) throw error;
      }
      return localLedger.getEntry(normalizedEntryId);
    },
    async findEntryByRequestId(requestId) {
      const normalizedRequestId = normalizeString(requestId, 120);
      if (!normalizedRequestId) return null;
      if (!remoteEnabled) {
        return localLedger.findEntryByRequestId(normalizedRequestId);
      }
      try {
        const remoteEntry = await supabaseClient.fetchEntryByRequestId(normalizedRequestId);
        markRemoteSuccess("fetch-entry-by-request-id");
        if (remoteEntry) return remoteEntry;
      } catch (error) {
        markRemoteFailure("fetch-entry-by-request-id", error);
      }
      return localLedger.findEntryByRequestId(normalizedRequestId);
    },
    async deleteEntry(entryId, options = {}) {
      const normalizedEntryId = normalizeString(entryId, 120);
      if (!normalizedEntryId) return false;

      const entry = await readForWrite(normalizedEntryId);
      if (!entry) return false;
      if (options.requireNoOrder && hasEntryOrderState(entry)) {
        throw Object.assign(new Error("Cannot delete a request containing an order"), { code: "ORDER_EXISTS" });
      }
      if (!remoteEnabled) {
        rememberTrash(entry, "entry");
        localLedger.deleteEntry(normalizedEntryId);
        await removeOrderStoreEntry(normalizedEntryId, "delete-entry");
        return true;
      }

      try {
        const remoteDeleted = await supabaseClient.deleteEntry(normalizedEntryId, {
          ...options, expectedUpdatedAt: entry.updatedAt,
        });
        diagnostics.lastDeleteAt = getTimestamp();
        diagnostics.lastDeleteError = "";
        markRemoteSuccess("delete-entry");
        if (!remoteDeleted) throw Object.assign(new Error("Record changed or was removed; reload before deleting"), { code: "40001" });
      } catch (error) {
        diagnostics.lastDeleteAt = getTimestamp();
        diagnostics.lastDeleteError = normalizeString(error && error.message ? error.message : "Supabase delete failed.", 300);
        markRemoteFailure("delete-entry", error);
        throw error;
      }
      localLedger.deleteEntry(normalizedEntryId);
      await removeOrderStoreEntry(normalizedEntryId, "delete-entry");
      return true;
    },
    async listTrash() {
      return remoteEnabled ? supabaseClient.fetchTrash() : [...memoryTrash.values()].filter(item => !item.restored_at);
    },
    async restoreTrash(trashId) {
      assertDurableStorage();
      let entry;
      if (remoteEnabled) entry = await supabaseClient.restoreTrash(trashId);
      else {
        const item = memoryTrash.get(trashId);
        if (!item || item.restored_at) return null;
        const current = localLedger.getEntry(item.entry_id);
        if ((item.scope === "entry" && current) || (item.scope === "order" &&
          (!current || current.updatedAt !== item.live_updated_at || hasEntryOrderState(current)))) {
          throw new Error("Restore conflicts with a newer record");
        }
        entry = structuredClone(item.row_data);
        item.restored_at = new Date().toISOString();
      }
      if (entry) {
        localLedger.rememberEntry(entry);
        await syncOrderStoreEntry(entry, "restore-trash");
      }
      return entry;
    },
    async retrySubmission(entryId, optionsForRetry = {}) {
      assertDurableStorage();
      if (!remoteEnabled) {
        const result = await localLedger.retrySubmission(entryId, optionsForRetry);
        const entry = localLedger.getEntry(entryId);
        await syncOrderStoreEntry(entry, "retry-submission");
        return result;
      }

      const entry = await readForWrite(entryId);
      const expectedUpdatedAt = entry?.updatedAt;
      const result = await performQuoteOpsRetry(entry, optionsForRetry);
      if (entry) {
        await persistUpdate(entry, expectedUpdatedAt, "upsert-retry-result");
      }
      await syncOrderStoreEntry(entry, "retry-submission");
      return result;
    },
    async rescheduleRecurringEntries(plan) {
      assertDurableStorage();
      let saved;
      if (remoteEnabled) {
        // No sequential-write fallback: an absent migration must fail before changing any visit.
        saved = await supabaseClient.rescheduleRecurringEntries(plan);
        markRemoteSuccess("reschedule-recurring-series");
      } else {
        const entries = localLedger.listEntries({ includeHidden: true, limit: QUOTE_OPS_LEDGER_LIMIT });
        validateSchedulePlan(entries, plan);
        const timestamp = new Date().toISOString();
        saved = plan.changes.map(change => applyScheduleChange(localLedger.getEntry(change.id), change, timestamp));
        // No await between validation and commit in the isolated, in-memory adapter.
        for (const entry of saved) localLedger.rememberEntry(entry);
      }
      for (const entry of saved) {
        localLedger.rememberEntry(entry);
        await syncOrderStoreEntry(entry, "recurring-schedule");
      }
      return saved;
    },
    async updateOrderEntry(entryId, updates = {}) {
      const requireExistingOrder = Boolean(updates.requireExistingOrder);
      const entry = await readForWrite(entryId);
      if (!entry) return null;
      if (entry.payloadForRetry?.orderTrash) throw new Error("Order is in trash; restore it explicitly before editing");
      if (requireExistingOrder && !hasEntryOrderState(entry)) return null;

      const wasFutureOrder = isFutureOrder(entry);
      const previousSchedule = `${entry.selectedDate || ""} ${entry.selectedTime || ""}`;
      const expectedUpdatedAt = entry.updatedAt;
      const archivedOrder = updates.removeOrder && hasEntryOrderState(entry) ? structuredClone(entry) : null;
      const updatedEntry = applyOrderEntryUpdates(entry, updates);
      if (!updatedEntry) return null;

      try {
        await persistUpdate(updatedEntry, expectedUpdatedAt, "upsert-order-update");
      } catch (error) {
        if (requireExistingOrder && ["23505", "40001", "40P01"].includes(error.code)) return null;
        throw error;
      }
      if (!remoteEnabled && archivedOrder) rememberTrash(archivedOrder, "order", updatedEntry.updatedAt);
      await syncOrderStoreEntry(updatedEntry, "order-update");
      if (!wasFutureOrder || previousSchedule !== `${updatedEntry.selectedDate || ""} ${updatedEntry.selectedTime || ""}`) {
        await closeClientFollowupTasks(updatedEntry);
      }
      return updatedEntry;
    },
    async updateLeadEntry(entryId, updates = {}) {
      return serializeLeadUpdate(entryId, async () => {
        const entry = await readForWrite(entryId);
        if (!entry) return null;
        const expectedUpdatedAt = entry.updatedAt;
        const hadOrder = hasEntryOrderState(entry);

        if (updates.createPostCompletionFollowupTask) {
          let suppress = true;
          try {
            suppress = Boolean(nextCleaningTaskReason(entry, await listTaskAutomationEntries(entry), updates.now || new Date()));
          } catch (error) {
            markRemoteFailure("check-next-cleaning-task", error);
          }
          updates = { ...updates, suppressPostCompletionFollowupTask: suppress };
        }

        const updatedEntry =
          typeof applyLeadEntryUpdates === "function" ? applyLeadEntryUpdates(entry, updates) : entry;
        try {
          await persistUpdate(updatedEntry, expectedUpdatedAt, "upsert-lead-update");
        } catch (error) {
          throw Object.assign(new Error(`Changes were not persisted: ${error.message}`), { code: error.code, cause: error });
        }

        if (updates.taskStatusOnly || updates.taskDeadlineOnly || updates.taskCreateOnly) {
          return updatedEntry;
        }
        await syncOrderStoreEntry(updatedEntry, "lead-update");
        if (!hadOrder) await closeClientFollowupTasks(updatedEntry);
        return updatedEntry;
      });
    },
    async updateClientEntry(entryId, updates = {}) {
      const entry = await readForWrite(entryId);
      if (!entry) return null;
      const expectedUpdatedAt = entry.updatedAt;
      const updatedEntry =
        typeof applyClientEntryUpdates === "function" ? applyClientEntryUpdates(entry, updates) : entry;
      await persistUpdate(updatedEntry, expectedUpdatedAt, "upsert-client-update");
      await syncOrderStoreEntry(updatedEntry, "client-update");
      return updatedEntry;
    },
    async recordPaymentEvent(requestId, updates = {}) {
      assertDurableStorage();
      const normalizedRequestId = normalizeString(requestId, 120);
      if (!normalizedRequestId) return null;

      let entry = null;
      if (remoteEnabled) {
        try {
          entry = await supabaseClient.fetchEntryByRequestId(normalizedRequestId);
          markRemoteSuccess("fetch-entry-for-payment-update");
        } catch (error) {
          markRemoteFailure("fetch-entry-for-payment-update", error);
          throw error;
        }
      }
      if (!remoteEnabled) {
        entry = localLedger.findEntryByRequestId(normalizedRequestId);
      }
      if (!entry) return null;
      if (remoteEnabled) entry = structuredClone(entry);
      const expectedUpdatedAt = entry.updatedAt;
      const updatedEntry =
        typeof applyPaymentEntryUpdates === "function" ? applyPaymentEntryUpdates(entry, updates) : entry;
      await persistUpdate(updatedEntry, expectedUpdatedAt, "upsert-payment-update");
      await syncOrderStoreEntry(updatedEntry, "payment-update");
      return updatedEntry;
    },
  };
}

module.exports = {
  createQuoteOpsStore,
  filterQuoteOpsEntries,
};
