"use strict";

function createAdminWorkspaceHelpers(deps = {}) {
  const {
    ADMIN_CLIENTS_PATH,
    ADMIN_STAFF_PATH,
    buildAdminRedirectPath,
    formatAdminDateTime,
    getEntryOpenLeadTask,
    getEntryOrderCompletionData,
    getEntryOrderPolicyAcceptanceData,
    getEntryOrderState,
    getFormValue,
    getLeadStatus,
    hasEntryOrderState,
    normalizeLeadStatus,
    normalizeOrderStatus,
    normalizeString,
  } = deps;

  function buildLeadMutationPayload(entry, notice) {
    if (!entry) {
      return {
        ok: false,
        notice: notice || "lead-missing",
        error: "lead-missing",
      };
    }

    const payload =
      entry && entry.payloadForRetry && typeof entry.payloadForRetry === "object"
        ? entry.payloadForRetry
        : {};
    const adminLead =
      payload.adminLead && typeof payload.adminLead === "object"
        ? payload.adminLead
        : {};
    const leadStatus =
      typeof getLeadStatus === "function"
        ? getLeadStatus(entry)
        : normalizeLeadStatus(adminLead.status, hasEntryOrderState(entry) ? "confirmed" : "new");
    const openTask = typeof getEntryOpenLeadTask === "function" ? getEntryOpenLeadTask(entry) : null;
    const dueAtMs = Date.parse((openTask || {}).dueAt || "");

    return {
      ok: true,
      notice: notice || "lead-stage-saved",
      entry: {
        id: normalizeString(entry.id, 120),
        leadStatus,
        locked: leadStatus === "confirmed",
        managerLabel:
          normalizeString(adminLead.managerName, 200) ||
          normalizeString(adminLead.managerEmail, 250).toLowerCase() ||
          "Без менеджера",
        taskLabel: openTask
          ? normalizeString(openTask.title, 200)
          : leadStatus === "confirmed"
            ? "Заказ создан"
            : "Нет открытой задачи",
        hideDeadline: leadStatus === "confirmed" || leadStatus === "declined",
        dueLabel:
          openTask && typeof formatAdminDateTime === "function"
            ? formatAdminDateTime(openTask.dueAt)
            : "—",
        dueOverdue: Boolean(openTask) && Number.isFinite(dueAtMs) && dueAtMs < Date.now(),
        notes: normalizeString(adminLead.notes, 2000),
      },
    };
  }

  function buildOrderCompletionMutationPayload(entry, notice, options = {}) {
    if (!entry) {
      return {
        ok: false,
        notice: notice || "order-missing",
        error: "order-missing",
        message: "Заказ не найден.",
      };
    }

    const completionData = getEntryOrderCompletionData(entry);
    const updatedAt = normalizeString(completionData.updatedAt, 80);
    const updatedAtLabel =
      updatedAt && typeof formatAdminDateTime === "function"
        ? formatAdminDateTime(updatedAt)
        : "";

    function mapAssets(items = []) {
      return (Array.isArray(items) ? items : []).map((asset) => ({
        id: normalizeString(asset && asset.id, 180),
        fileName: normalizeString(asset && asset.fileName, 180),
        uploadedAt: normalizeString(asset && asset.uploadedAt, 80),
      }));
    }

    return {
      ok: true,
      notice: notice || "completion-saved",
      message: normalizeString(options.message, 200) || "Отчёт клинера сохранён.",
      completion: {
        cleanerComment: normalizeString(completionData.cleanerComment, 4000),
        cleanerComments: (Array.isArray(completionData.cleanerComments)
          ? completionData.cleanerComments
          : []
        ).map((comment) => ({
          id: normalizeString(comment && comment.id, 120),
          text: normalizeString(comment && comment.text, 1000),
          authorName: normalizeString(comment && comment.authorName, 120),
          authorEmail: normalizeString(comment && comment.authorEmail, 250),
          createdAt: normalizeString(comment && comment.createdAt, 80),
        })),
        updatedAt,
        updatedAtLabel,
        beforePhotos: mapAssets(completionData.beforePhotos),
        afterPhotos: mapAssets(completionData.afterPhotos),
      },
    };
  }

  function buildOrderStageMutationPayload(entry, notice) {
    if (!entry) {
      return {
        ok: false,
        notice: notice || "order-missing",
        error: "order-missing",
        message: "Заказ не найден.",
      };
    }

    const orderStatus = normalizeOrderStatus(
      (((entry.payloadForRetry || {}).adminOrder || {}).status || ""),
      "new"
    );
    const policyAcceptance =
      typeof getEntryOrderPolicyAcceptanceData === "function"
        ? getEntryOrderPolicyAcceptanceData(entry)
        : {};
    const hasSentPolicyInvite = Boolean(
      normalizeString(policyAcceptance.sentAt, 80) ||
        normalizeString(policyAcceptance.firstViewedAt, 80) ||
        normalizeString(policyAcceptance.lastViewedAt, 80) ||
        normalizeString(policyAcceptance.signedAt, 80)
    );
    const funnelStatus =
      orderStatus === "scheduled" && hasSentPolicyInvite && !policyAcceptance.policyAccepted
        ? "policy"
        : orderStatus;

    return {
      ok: true,
      notice: notice || "order-saved",
      order: {
        id: normalizeString(entry.id, 120),
        orderStatus,
        funnelStatus,
      },
    };
  }

  function getOrderStatusFromEntry(entry) {
    return normalizeOrderStatus(getEntryOrderState(entry).status, "new");
  }

  function buildClientsReturnPath(value) {
    const candidate = normalizeString(value, 1000);
    if (!candidate) return ADMIN_CLIENTS_PATH;

    try {
      const parsed = new URL(candidate, "http://localhost");
      if (parsed.pathname !== ADMIN_CLIENTS_PATH) return ADMIN_CLIENTS_PATH;
      return `${parsed.pathname}${parsed.search}`;
    } catch {
      return ADMIN_CLIENTS_PATH;
    }
  }

  function buildStaffReturnPath(value) {
    const candidate = normalizeString(value, 1000);
    if (!candidate) return ADMIN_STAFF_PATH;

    try {
      const parsed = new URL(candidate, "http://localhost");
      if (parsed.pathname !== ADMIN_STAFF_PATH) return ADMIN_STAFF_PATH;
      return `${parsed.pathname}${parsed.search}`;
    } catch {
      return ADMIN_STAFF_PATH;
    }
  }

  function buildStaffRedirect(notice, extra = {}) {
    return buildAdminRedirectPath(ADMIN_STAFF_PATH, {
      notice,
      ...extra,
    });
  }

  function isAdminWorkspaceRole(role) {
    return normalizeString(role, 32).toLowerCase() === "admin";
  }

  function isEmployeeLinkedUser(user) {
    if (!user || typeof user !== "object") return false;
    if (Object.prototype.hasOwnProperty.call(user, "isEmployee")) {
      const rawValue = user.isEmployee;
      if (rawValue === true || rawValue === false) return rawValue;
      const normalized = normalizeString(rawValue, 20).toLowerCase();
      return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
    }
    return !isAdminWorkspaceRole(user.role);
  }

  function collectNonAssignableStaffIds(users = []) {
    const blockedIds = new Set();
    (Array.isArray(users) ? users : []).forEach((user) => {
      const staffId = normalizeString(user && user.staffId, 120);
      if (!staffId) return;
      if (!isEmployeeLinkedUser(user)) {
        blockedIds.add(staffId);
      }
    });
    return blockedIds;
  }

  async function resolveLinkedUser(usersStore, { userId = "", staffId = "", email = "" } = {}) {
    if (!usersStore) return null;

    const normalizedUserId = normalizeString(userId, 120);
    if (normalizedUserId && typeof usersStore.getUserById === "function") {
      const directMatch = await usersStore.getUserById(normalizedUserId, { includeSecret: true });
      if (directMatch) return directMatch;
    }

    if (typeof usersStore.getSnapshot !== "function") {
      return null;
    }

    const normalizedStaffId = normalizeString(staffId, 120);
    const normalizedEmail = normalizeString(email, 200).toLowerCase();
    const snapshot = await usersStore.getSnapshot();
    const matchedUser =
      snapshot && Array.isArray(snapshot.users)
        ? snapshot.users.find(
            (user) =>
              user &&
              ((normalizedStaffId && user.staffId === normalizedStaffId) ||
                (normalizedEmail &&
                  normalizeString(user.email, 200).toLowerCase() === normalizedEmail))
          ) || null
        : null;

    if (!matchedUser || typeof usersStore.getUserById !== "function") {
      return null;
    }

    return usersStore.getUserById(matchedUser.id, { includeSecret: true });
  }

  async function resolveLinkedStaff(staffStore, { staffId = "", email = "" } = {}) {
    if (!staffStore || typeof staffStore.getSnapshot !== "function") {
      return null;
    }

    const normalizedStaffId = normalizeString(staffId, 120);
    const normalizedEmail = normalizeString(email, 200).toLowerCase();
    const snapshot = await staffStore.getSnapshot();
    return snapshot && Array.isArray(snapshot.staff)
      ? snapshot.staff.find(
          (record) =>
            record &&
            ((normalizedStaffId && record.id === normalizedStaffId) ||
              (normalizedEmail &&
                normalizeString(record.email, 200).toLowerCase() === normalizedEmail))
        ) || null
      : null;
  }

  async function resolveAssignableStaffIdsByNames(staffStore, usersStore, selectedNames = []) {
    if (!staffStore || typeof staffStore.getSnapshot !== "function") {
      return {
        snapshot: { staff: [], assignments: [] },
        staffIds: [],
        staffNames: [],
      };
    }

    const snapshot = await staffStore.getSnapshot();
    const blockedStaffIds = new Set();
    if (usersStore && typeof usersStore.getSnapshot === "function") {
      const usersSnapshot = await usersStore.getSnapshot();
      if (usersSnapshot && Array.isArray(usersSnapshot.users)) {
        for (const staffId of collectNonAssignableStaffIds(usersSnapshot.users)) {
          blockedStaffIds.add(staffId);
        }
      }
    }

    const staffRecordByName = new Map();
    const blockedStaffByName = new Map();
    (Array.isArray(snapshot.staff) ? snapshot.staff : []).forEach((record) => {
      const staffId = normalizeString(record && record.id, 120);
      const staffName = normalizeString(record && record.name, 120);
      const key = staffName.toLowerCase();
      if (!staffId || !staffName) return;
      if (blockedStaffIds.has(staffId)) {
        if (!blockedStaffByName.has(key)) {
          blockedStaffByName.set(key, {
            id: staffId,
            name: staffName,
          });
        }
        return;
      }
      if (!staffRecordByName.has(key)) {
        staffRecordByName.set(key, {
          id: staffId,
          name: staffName,
        });
      }
    });

    const staffIds = [];
    const staffNames = [];
    const seen = new Set();
    const seenFreeformNames = new Set();
    (Array.isArray(selectedNames) ? selectedNames : []).forEach((name) => {
      const normalizedName = normalizeString(name, 120);
      const key = normalizedName.toLowerCase();
      if (!key) return;
      const staffRecord = key ? staffRecordByName.get(key) : null;
      if (staffRecord) {
        if (seen.has(staffRecord.id)) return;
        seen.add(staffRecord.id);
        staffIds.push(staffRecord.id);
        staffNames.push(staffRecord.name);
        return;
      }

      if (blockedStaffByName.has(key) || seenFreeformNames.has(key)) return;
      seenFreeformNames.add(key);
      staffNames.push(normalizedName);
    });

    return {
      snapshot,
      staffIds,
      staffNames: staffNames.filter(Boolean),
    };
  }

  async function resolveLeadManagerRecord(usersStore, staffStore, managerId) {
    const normalizedManagerId = normalizeString(managerId, 120);
    if (!normalizedManagerId || !usersStore || typeof usersStore.getSnapshot !== "function") {
      return null;
    }

    const usersSnapshot = await usersStore.getSnapshot();
    const users = Array.isArray(usersSnapshot && usersSnapshot.users) ? usersSnapshot.users : [];
    const matchedUser = users.find((user) => {
      if (!user || normalizeString(user.id, 120) !== normalizedManagerId) return false;
      if (normalizeString(user.status, 32).toLowerCase() !== "active") return false;
      const role = normalizeString(user.role, 32).toLowerCase();
      return role === "manager";
    });
    if (!matchedUser) return null;

    let managerName = "";
    if (staffStore && typeof staffStore.getSnapshot === "function" && matchedUser.staffId) {
      const staffSnapshot = await staffStore.getSnapshot();
      const staffRecord = (Array.isArray(staffSnapshot && staffSnapshot.staff) ? staffSnapshot.staff : []).find(
        (record) => normalizeString(record && record.id, 120) === normalizeString(matchedUser.staffId, 120)
      );
      managerName = normalizeString(staffRecord && staffRecord.name, 200);
    }

    return {
      id: normalizeString(matchedUser.id, 120),
      name: managerName || normalizeString(matchedUser.email, 200),
      email: normalizeString(matchedUser.email, 250).toLowerCase(),
    };
  }

  function buildOrdersRedirect(returnTo, notice, extra = {}) {
    return buildAdminRedirectPath(returnTo, {
      notice,
      ...extra,
    });
  }

  function normalizeManualOrderServiceType(value) {
    const normalized = normalizeString(value, 40)
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/_/g, "-");
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
    return "standard";
  }

  function normalizeManualOrderFrequency(value) {
    const normalized = normalizeString(value, 40)
      .toLowerCase()
      .replace(/[\s_-]+/g, "");
    if (normalized === "weekly") return "weekly";
    if (normalized === "biweekly") return "biweekly";
    if (normalized === "monthly") return "monthly";
    return "";
  }

  function formatManualOrderServiceLabel(serviceType) {
    if (serviceType === "deep") return "Deep";
    if (serviceType === "move-in/out") return "Move-in/out";
    return "Standard";
  }

  function buildManualOrderRequestId(customerName) {
    const slug = normalizeString(customerName, 80)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    const suffix = Date.now().toString(36).slice(-6);
    return normalizeString(`manual-${slug || "order"}-${suffix}`, 120);
  }

  function normalizeAdminPhoneInput(value) {
    const raw = normalizeString(value, 80);
    if (!raw) return "";

    let digits = raw.replace(/\D+/g, "");
    if (!digits) return "";

    while (digits.length > 10 && digits.startsWith("1")) {
      digits = digits.slice(1);
    }
    if (digits.length > 10) {
      digits = digits.slice(0, 10);
    }

    if (digits.length !== 10) return "";
    return `+1(${digits.slice(0, 3)})${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
  }

  function normalizeWorkspaceRoleValue(value) {
    const normalized = normalizeString(value, 80).toLowerCase();
    if (!normalized) return "cleaner";
    if (normalized === "admin" || normalized === "админ" || normalized === "administrator") return "admin";
    if (
      normalized === "manager" ||
      normalized === "менеджер" ||
      normalized.includes("manager") ||
      normalized.includes("lead")
    ) {
      return "manager";
    }
    if (
      normalized === "cleaner" ||
      normalized === "клинер" ||
      normalized.includes("clean")
    ) {
      return "cleaner";
    }
    return "cleaner";
  }

  function formatWorkspaceRoleLabel(role) {
    if (role === "admin") return "Админ";
    if (role === "manager") return "Менеджер";
    return "Клинер";
  }

  function resolveUserEmployeeFlag(formBody, userRole) {
    if (formBody && Object.prototype.hasOwnProperty.call(formBody, "isEmployee")) {
      return getFormValue(formBody, "isEmployee", 20) === "1";
    }
    return userRole !== "admin";
  }

  return {
    buildClientsReturnPath,
    buildLeadMutationPayload,
    buildManualOrderRequestId,
    buildOrderCompletionMutationPayload,
    buildOrdersRedirect,
    buildOrderStageMutationPayload,
    buildStaffRedirect,
    buildStaffReturnPath,
    collectNonAssignableStaffIds,
    formatManualOrderServiceLabel,
    formatWorkspaceRoleLabel,
    getOrderStatusFromEntry,
    isAdminWorkspaceRole,
    isEmployeeLinkedUser,
    normalizeAdminPhoneInput,
    normalizeManualOrderFrequency,
    normalizeManualOrderServiceType,
    normalizeWorkspaceRoleValue,
    resolveAssignableStaffIdsByNames,
    resolveLeadManagerRecord,
    resolveLinkedStaff,
    resolveLinkedUser,
    resolveUserEmployeeFlag,
  };
}

module.exports = {
  createAdminWorkspaceHelpers,
};
