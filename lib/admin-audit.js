"use strict";

const { AsyncLocalStorage } = require("node:async_hooks");
const crypto = require("node:crypto");
const { hasEntryOrderState, getEntryOrderState } = require("./admin-order-state");

const context = new AsyncLocalStorage();
const METHODS = new Set(["recordSubmission", "updateOrderEntry", "updateClientEntry", "updateLeadEntry", "deleteEntry", "recordPaymentEvent", "restoreTrash"]);
const ORDER_FIELDS = new Set(["createOrder", "removeOrder", "orderStatus", "selectedDate", "selectedTime", "serviceType", "serviceName",
  "fullAddress", "assignedStaff", "paymentStatus", "paymentMethod", "totalPrice", "serviceDurationMinutes", "frequency",
  "quoteCalculatorData", "cleanerComment", "cleanerComments", "completionCleanerComments", "completionChecklistItems",
  "completionBeforePhotos", "completionAfterPhotos", "completionPhotosSkipped", "payrollOverrides", "payroll",
  "policyAcceptance", "cleanerConfirmation", "managerConfirmedAt", "fullPriceBeforeDiscount", "recurringAdditionalDetails",
  "recurringSeriesCanceledFromDate"]);
const QUOTE_FIELDS = ["rooms", "bathrooms", "squareMeters", "additionalRooms", "hasPets", "basementCleaning", "services",
  "quantityServices", "refrigeratorCondition", "cabinetsCondition", "additionalDetails", "consent", "addressLine2", "city", "state", "zipCode",
  "initialCleaning", "propertyType"];
const PROFILE_FIELDS = ["addressBook", "secondaryPhone", "automaticNotificationsEnabled", "paymentNotificationsEnabled", "removedAddressKeys"];

function runAuditContext(data, callback) {
  // Dynamic URL segments can carry confirmation tokens; keep only the route prefix.
  const route = String(data.route || "").split("?")[0].split("/").slice(0, 4).join("/");
  return context.run({ ...data, route, requestId: crypto.randomUUID() }, callback);
}

function getAuditMetadata() {
  const state = context.getStore();
  const background = !state || ["GET", "HEAD"].includes(state.method);
  const website = state?.route?.startsWith("/api/quote/");
  return { requestId: state?.requestId || crypto.randomUUID(), route: state?.route || "",
    actor: background ? { id: "system", name: "Автоматически", role: "system", source: "background" }
      : state.actor || { id: website ? "website" : "system", name: website ? "Клиент с сайта" : "Автоматически", role: "system", source: "system" } };
}

async function setAuditActor(access, email = "", staffStore = null) {
  const state = context.getStore();
  if (!state || !access || !access.authorized) return;
  const user = access.user;
  let name = user && user.name;
  if (user && !name && user.staffId && staffStore && !["GET", "HEAD"].includes(state.method)) {
    try { name = (await staffStore.getSnapshot()).staff.find(staff => staff.id === user.staffId)?.name; }
    catch { /* The immutable user ID and email still identify the actor if staff lookup is unavailable. */ }
  }
  state.actor = user ? { id: user.id, name: name || user.email, email: user.email, role: access.role, source: "user-session" }
    : { id: `legacy-admin:${email}`, name: "Общий администратор", email, role: "admin", source: "admin-session" };
}

function clientKey(entry) {
  let phone = String(entry.customerPhone || "").replace(/\D/g, "");
  if (phone.length === 11 && phone[0] === "1") phone = phone.slice(1);
  return phone || String(entry.customerEmail || "").toLowerCase() || `${entry.customerName || ""}|${entry.fullAddress || ""}`.toLowerCase();
}

function isBusinessEntry(entry) {
  return Boolean(entry && !String(entry.kind || "").startsWith("admin_") && (entry.customerName || entry.customerPhone || entry.customerEmail));
}

function safeValue(value, depth = 0) {
  if (value == null) return null;
  if (typeof value === "string") return value.slice(0, 8000);
  if (typeof value === "boolean" || typeof value === "number") return value;
  if (depth >= 4) return null;
  if (Array.isArray(value)) return value.slice(0, 200).map(item => safeValue(item, depth + 1));
  if (typeof value === "object") return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !/token|secret|password|signature|authorization|cookie|url|path/i.test(key))
    .slice(0, 100).map(([key, item]) => [key, safeValue(item, depth + 1)]));
  return null;
}

function snapshot(entry, entityType) {
  if (!entry) return null;
  const payload = entry.payloadForRetry || {};
  const profile = payload.adminClient || {};
  const quote = payload.calculatorData || {};
  const order = getEntryOrderState(entry);
  const result = { customerName: entry.customerName || "", customerPhone: entry.customerPhone || "",
    customerEmail: entry.customerEmail || "", fullAddress: entry.fullAddress || "" };
  for (const key of PROFILE_FIELDS) result[`client.${key}`] = safeValue(profile[key]);
  result["client.photosCount"] = Array.isArray(profile.photos) ? profile.photos.length : 0;
  if (entityType === "order") {
    for (const key of ["status", "assignedStaff", "paymentStatus", "paymentMethod", "frequency", "payrollOverrides"])
      result[key] = safeValue(order[key]);
    result.policyAccepted = Boolean(order.policyAccepted || order.policyAcceptance?.policyAccepted);
    result.policyAcceptedAt = order.policyAcceptance?.acceptedAt || "";
    result.cleanerConfirmedAt = order.cleanerConfirmation?.confirmedAt || "";
    result.managerConfirmedAt = order.managerConfirmedAt || "";
    result.recurringAdditionalDetails = order.recurringAdditionalDetails || "";
    result.recurringSeriesCanceledFromDate = order.recurringSeriesCanceledFromDate || "";
    result.payroll = safeValue(order.payroll);
    result.totalPrice = Number(entry.totalPrice || 0);
    result.selectedDate = entry.selectedDate || order.selectedDate || "";
    result.selectedTime = entry.selectedTime || order.selectedTime || "";
    result.serviceType = entry.serviceType || quote.serviceType || "";
    result.serviceDurationMinutes = order.serviceDurationMinutes || quote.serviceDurationMinutes || entry.serviceDurationMinutes || 0;
    for (const key of QUOTE_FIELDS) result[`quote.${key}`] = safeValue(quote[key]);
    const completion = order.completion || {};
    for (const key of ["cleanerComment", "cleanerComments", "checklistItems", "photosSkipped"])
      result[`completion.${key}`] = safeValue(completion[key]);
    for (const key of ["beforePhotos", "afterPhotos"])
      result[`completion.${key}Count`] = Array.isArray(completion[key]) ? completion[key].length : 0;
  }
  return result;
}

function diff(before, after) {
  return [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])].sort()
    .filter(key => JSON.stringify(before?.[key] ?? null) !== JSON.stringify(after?.[key] ?? null))
    .map(field => ({ field, old: before?.[field] ?? null, new: after?.[field] ?? null }));
}

function createAuditedQuoteOpsLedger(ledger, store, log = () => {}, { previewOrderUpdate } = {}) {
  const entryLocks = new Map();
  async function clientEntries(state) {
    if (!state.clientEntries) {
      let entries;
      try {
        entries = typeof ledger.listAllEntries === "function" ? await ledger.listAllEntries()
          : await ledger.listEntries({ includeHidden: true, limit: 100000 });
      } catch {
        // Quote storage already supports a memory fallback; audit must label it as unconfirmed, not disable that flow.
        state.clientIndexUnconfirmed = true;
        entries = await ledger.listEntries({ includeHidden: true, limit: 100000 });
      }
      state.clientEntries = entries.filter(isBusinessEntry).map(entry => ({ id: entry.id, key: clientKey(entry) }));
    }
    return state.clientEntries;
  }
  return new Proxy(ledger, {
    get(target, method) {
      if (!METHODS.has(method)) return typeof target[method] === "function" ? target[method].bind(target) : target[method];
      return async (...args) => {
        if (method === "restoreTrash") {
          const item = (await target.listTrash()).find(item => item.id === args[0]);
          if (!item) return null;
          const raw = item.row_data || {};
          const metadata = getAuditMetadata();
          const entityType = hasEntryOrderState({ payloadForRetry: raw.payloadForRetry || raw.payload_for_retry }) ? "order" : "client";
          const event = await store.begin({ request_id: metadata.requestId, actor: metadata.actor, entity_type: entityType,
            entity_id: item.entry_id, entry_id: item.entry_id, entity_label: raw.customerName || raw.customer_name || "",
            action: "restore", route: metadata.route, before_data: null });
          let result;
          try { result = await target.restoreTrash(...args); }
          catch (error) { await store.finish(event, { status: "failed" }); throw error; }
          const after = result ? snapshot(result, entityType) : null;
          await store.finish(event, { status: result ? "succeeded" : "failed", after_data: after, changes: diff(null, after) });
          return result;
        }
        const lockKey = method === "recordSubmission" ? `client:${clientKey(args[0] || {})}` : method === "recordPaymentEvent"
          ? (await target.findEntryByRequestId(args[0]))?.id || args[0] : args[0];
        const previous = entryLocks.get(lockKey);
        let release;
        const lock = new Promise(resolve => { release = resolve; });
        entryLocks.set(lockKey, lock);
        if (previous) await previous;
        try {
          const state = context.getStore() || { method: "SYSTEM", route: "", requestId: crypto.randomUUID() };
          const updates = args[1] || {};
          if (method === "updateLeadEntry" && (updates.taskStatusOnly || updates.taskDeadlineOnly || updates.taskCreateOnly)) return await target[method](...args);
          const existing = method === "recordSubmission" ? args[0] : method === "recordPaymentEvent"
            ? await target.findEntryByRequestId(args[0]) : await target.getEntry(args[0]);
          if (!isBusinessEntry(existing)) return await target[method](...args);
          const readDiagnostics = typeof target.getDiagnostics === "function" ? target.getDiagnostics() : {};
          const beforeUnconfirmed = readDiagnostics.mode === "supabase" && readDiagnostics.remoteStatus !== "healthy";
          const beforeEntry = structuredClone(existing);
          const hasOrder = hasEntryOrderState(beforeEntry);
          if (method === "updateOrderEntry" && hasOrder && previewOrderUpdate &&
              !Object.keys(updates).some(key => ORDER_FIELDS.has(key))) {
            const predicted = previewOrderUpdate(structuredClone(beforeEntry), updates);
            if (!diff(snapshot(beforeEntry, "order"), snapshot(predicted, "order")).length)
              return await target[method](...args);
          }
          const createsOrder = method === "updateOrderEntry" || (method === "updateLeadEntry" && updates.status === "confirmed");
          const entityType = method === "updateClientEntry" ? "client" : hasOrder || createsOrder ? "order" : "client";
          const action = method === "deleteEntry" || updates.removeOrder ? "delete"
            : method === "recordSubmission" || (entityType === "order" && !hasOrder) ? "create" : "update";
          const key = clientKey(existing);
          let lastClientEntry = false;
          let firstClientEntry = false;
          if (method === "recordSubmission" || method === "deleteEntry") {
            const entries = await clientEntries(state);
            const matching = entries.filter(entry => entry.key === key);
            if (method === "recordSubmission" && matching.length && !hasOrder) {
              const result = await target[method](...args);
              if (result) entries.push({ id: result.id, key });
              return result;
            }
            lastClientEntry = method === "deleteEntry" && matching.length === 1 && !state.clientIndexUnconfirmed;
            firstClientEntry = method === "recordSubmission" && matching.length === 0;
            if (method === "deleteEntry" && !hasOrder && matching.length > 1) {
              const result = await target[method](...args);
              if (result) state.clientEntries = entries.filter(entry => entry.id !== args[0]);
              return result;
            }
          }
          // Persist intent first: an unavailable journal must not allow an unrecorded mutation.
          const actor = state.method === "GET" || state.method === "HEAD"
            ? { id: "system", name: "Автоматически", email: "", role: "system", source: "background" }
            : state.actor || { id: state.route?.startsWith("/api/quote/") ? "website" : "system",
              name: state.route?.startsWith("/api/quote/") ? "Клиент с сайта" : "Автоматически", email: "", role: "system", source: "system" };
          const before = action === "create" ? null : snapshot(beforeEntry, entityType);
          const event = await store.begin({ request_id: state.requestId, actor, entity_type: entityType,
            entity_id: entityType === "client" ? key : beforeEntry.id || "pending",
            entity_label: String(beforeEntry.customerName || "").slice(0, 250), entry_id: beforeEntry.id || null,
            action, route: String(state.route || "").slice(0, 200), before_data: before });
          const clientEvent = (lastClientEntry || firstClientEntry) && entityType === "order" ? await store.begin({
            request_id: state.requestId, actor, entity_type: "client", entity_id: key,
            entity_label: beforeEntry.customerName || "", entry_id: beforeEntry.id || null,
            action: firstClientEntry ? "create" : "delete",
            route: state.route || "", before_data: firstClientEntry ? null : snapshot(beforeEntry, "client"),
          }) : null;
          async function finish(record, result) {
            try { await store.finish(record, result); }
            catch { log({ type: "admin_audit_completion_failed", audit_id: record.id, request_id: state.requestId,
              entity_id: record.entity_id }); }
          }
          let result;
          try { result = await target[method](...args); }
          catch (error) {
            await finish(event, { status: "failed" });
            if (clientEvent) await finish(clientEvent, { status: "failed" });
            throw error;
          }
          const after = action === "delete" ? null : result ? snapshot(result, entityType) : before;
          const changes = diff(before, after);
          const diagnostics = typeof target.getDiagnostics === "function" ? target.getDiagnostics() : {};
          const status = !result ? "failed" : beforeUnconfirmed || state.clientIndexUnconfirmed || (diagnostics.mode === "supabase" && diagnostics.remoteStatus !== "healthy")
            ? "unconfirmed" : changes.length || action !== "update" ? "succeeded" : "noop";
          await finish(event, { status, after_data: after, changes,
            ...(method === "recordSubmission" && result?.id ? { entry_id: result.id,
              ...(entityType === "order" ? { entity_id: result.id } : {}) } : {}) });
          if (clientEvent) {
            const clientAfter = firstClientEntry && result ? snapshot(result, "client") : null;
            await finish(clientEvent, { status, after_data: clientAfter, changes: diff(clientEvent.before_data, clientAfter),
              ...(firstClientEntry && result?.id ? { entry_id: result.id } : {}) });
          }
          if (result && state.clientEntries) {
            if (method === "deleteEntry") state.clientEntries = state.clientEntries.filter(entry => entry.id !== args[0]);
            if (method === "recordSubmission") state.clientEntries.push({ id: result.id, key });
          }
          return result;
        } finally {
          release();
          if (entryLocks.get(lockKey) === lock) entryLocks.delete(lockKey);
        }
      };
    },
  });
}

module.exports = { createAuditedQuoteOpsLedger, runAuditContext, setAuditActor, getAuditMetadata, snapshot, diff };
