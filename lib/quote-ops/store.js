"use strict";

const crypto = require("crypto");

const HIDDEN_ENTRY_KINDS = new Set([
  "admin_staff_member",
  "admin_staff_assignment",
  "admin_user_account",
  "admin_mail_integration",
]);

function getQuoteOpsSearchHaystack(entry) {
  return [
    entry.requestId,
    entry.customerName,
    entry.customerPhone,
    entry.customerEmail,
    entry.contactId,
    entry.serviceName,
    entry.serviceType,
    entry.source,
    entry.code,
    entry.errorMessage,
  ]
    .join(" ")
    .toLowerCase();
}

function filterQuoteOpsEntries(entries = [], filters = {}, normalizeString) {
  const status = normalizeString(filters.status, 32).toLowerCase();
  const serviceType = normalizeString(filters.serviceType, 32).toLowerCase();
  const query = normalizeString(filters.q, 200).toLowerCase();
  const limitValue = Number.isFinite(filters.limit) ? filters.limit : entries.length;

  return entries
    .filter((entry) => {
      const kind = normalizeString(entry && entry.kind, 64);
      if (HIDDEN_ENTRY_KINDS.has(kind)) return false;
      if (status && status !== "all" && entry.status !== status) return false;
      if (serviceType && serviceType !== "all" && entry.serviceType !== serviceType) return false;
      if (query && !getQuoteOpsSearchHaystack(entry).includes(query)) return false;
      return true;
    })
    .slice(0, Math.max(0, limitValue));
}

function createQuoteOpsStore(deps = {}) {
  const {
    QUOTE_OPS_LEDGER_LIMIT,
    applyClientEntryUpdates,
    applyOrderEntryUpdates,
    createSupabaseQuoteOpsClient,
    env = process.env,
    fetch = global.fetch,
    normalizeString,
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
      entry.errorMessage = "";
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
      return {
        id: crypto.randomUUID(),
        kind: "quote_submission",
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
        fullAddress: normalizeString(input.fullAddress, 500),
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

    return {
      recordSubmission(input = {}) {
        const entry = createBaseEntry(input);
        entries.unshift(entry);
        entryById.set(entry.id, entry);
        trim();
        return entry;
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
      listEntries(filters = {}) {
        return filterQuoteOpsEntries(entries, filters, normalizeString);
      },
      updateOrderEntry(entryId, updates = {}) {
        const entry = entryById.get(normalizeString(entryId, 120));
        if (!entry) return null;
        return applyOrderEntryUpdates(entry, updates);
      },
      updateClientEntry(entryId, updates = {}) {
        const entry = entryById.get(normalizeString(entryId, 120));
        if (!entry) return null;
        return typeof applyClientEntryUpdates === "function" ? applyClientEntryUpdates(entry, updates) : entry;
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
      const entry = localLedger.recordSubmission(input);
      if (!remoteEnabled) return entry;
      try {
        await supabaseClient.upsertEntry(entry);
        diagnostics.lastWriteAt = getTimestamp();
        diagnostics.lastWriteError = "";
        markRemoteSuccess("upsert-entry");
      } catch (error) {
        diagnostics.lastWriteAt = getTimestamp();
        diagnostics.lastWriteError = normalizeString(error && error.message ? error.message : "Supabase write failed.", 300);
        markRemoteFailure("upsert-entry", error);
      }
      return entry;
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
    async getEntry(entryId) {
      const normalizedEntryId = normalizeString(entryId, 120);
      if (!normalizedEntryId) return null;
      if (!remoteEnabled) {
        return localLedger.getEntry(normalizedEntryId);
      }
      try {
        const remoteEntry = await supabaseClient.fetchEntryById(normalizedEntryId);
        markRemoteSuccess("fetch-entry");
        if (remoteEntry) return remoteEntry;
      } catch (error) {
        markRemoteFailure("fetch-entry", error);
      }
      return localLedger.getEntry(normalizedEntryId);
    },
    async deleteEntry(entryId) {
      const normalizedEntryId = normalizeString(entryId, 120);
      if (!normalizedEntryId) return false;

      let deleted = localLedger.deleteEntry(normalizedEntryId);
      if (!remoteEnabled) {
        return deleted;
      }

      try {
        const remoteDeleted = await supabaseClient.deleteEntry(normalizedEntryId);
        diagnostics.lastDeleteAt = getTimestamp();
        diagnostics.lastDeleteError = "";
        markRemoteSuccess("delete-entry");
        deleted = remoteDeleted || deleted;
      } catch (error) {
        diagnostics.lastDeleteAt = getTimestamp();
        diagnostics.lastDeleteError = normalizeString(error && error.message ? error.message : "Supabase delete failed.", 300);
        markRemoteFailure("delete-entry", error);
        return deleted;
      }

      return deleted;
    },
    async retrySubmission(entryId, optionsForRetry = {}) {
      if (!remoteEnabled) {
        return localLedger.retrySubmission(entryId, optionsForRetry);
      }

      let entry = null;
      try {
        entry = await supabaseClient.fetchEntryById(entryId);
        markRemoteSuccess("fetch-entry-for-retry");
      } catch (error) {
        markRemoteFailure("fetch-entry-for-retry", error);
      }
      if (!entry) {
        entry = localLedger.getEntry(entryId);
      }

      const result = await performQuoteOpsRetry(entry, optionsForRetry);
      if (entry) {
        try {
          await supabaseClient.upsertEntry(entry);
          diagnostics.lastWriteAt = getTimestamp();
          diagnostics.lastWriteError = "";
          markRemoteSuccess("upsert-retry-result");
        } catch (error) {
          diagnostics.lastWriteAt = getTimestamp();
          diagnostics.lastWriteError = normalizeString(error && error.message ? error.message : "Supabase write failed.", 300);
          markRemoteFailure("upsert-retry-result", error);
        }
      }
      return result;
    },
    async updateOrderEntry(entryId, updates = {}) {
      let entry = null;
      if (remoteEnabled) {
        try {
          entry = await supabaseClient.fetchEntryById(entryId);
          markRemoteSuccess("fetch-entry-for-order-update");
        } catch (error) {
          markRemoteFailure("fetch-entry-for-order-update", error);
        }
      }
      if (!entry) {
        entry = localLedger.getEntry(entryId);
      }
      if (!entry) return null;

      const updatedEntry = applyOrderEntryUpdates(entry, updates);
      localLedger.updateOrderEntry(entryId, updates);

      if (remoteEnabled) {
        try {
          await supabaseClient.upsertEntry(updatedEntry);
          diagnostics.lastWriteAt = getTimestamp();
          diagnostics.lastWriteError = "";
          markRemoteSuccess("upsert-order-update");
        } catch (error) {
          diagnostics.lastWriteAt = getTimestamp();
          diagnostics.lastWriteError = normalizeString(error && error.message ? error.message : "Supabase write failed.", 300);
          markRemoteFailure("upsert-order-update", error);
          throw error;
        }
      }

      return updatedEntry;
    },
    async updateClientEntry(entryId, updates = {}) {
      let entry = null;
      if (remoteEnabled) {
        try {
          entry = await supabaseClient.fetchEntryById(entryId);
          markRemoteSuccess("fetch-entry-for-client-update");
        } catch (error) {
          markRemoteFailure("fetch-entry-for-client-update", error);
        }
      }
      if (!entry) {
        entry = localLedger.getEntry(entryId);
      }
      if (!entry) return null;

      const updatedEntry =
        typeof applyClientEntryUpdates === "function" ? applyClientEntryUpdates(entry, updates) : entry;
      localLedger.updateClientEntry(entryId, updates);

      if (remoteEnabled) {
        try {
          await supabaseClient.upsertEntry(updatedEntry);
          diagnostics.lastWriteAt = getTimestamp();
          diagnostics.lastWriteError = "";
          markRemoteSuccess("upsert-client-update");
        } catch (error) {
          diagnostics.lastWriteAt = getTimestamp();
          diagnostics.lastWriteError = normalizeString(error && error.message ? error.message : "Supabase write failed.", 300);
          markRemoteFailure("upsert-client-update", error);
          throw error;
        }
      }

      return updatedEntry;
    },
  };
}

module.exports = {
  createQuoteOpsStore,
  filterQuoteOpsEntries,
};
