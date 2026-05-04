"use strict";

function defaultNormalizeString(value, maxLength = 0) {
  const stringValue = typeof value === "string" ? value : value == null ? "" : String(value);
  const trimmedValue = stringValue.trim();
  if (!maxLength || trimmedValue.length <= maxLength) return trimmedValue;
  return trimmedValue.slice(0, maxLength);
}

function createWorkspaceHelpers(deps = {}) {
  const normalizeString =
    typeof deps.normalizeString === "function" ? deps.normalizeString : defaultNormalizeString;

  function formatWorkspaceRoleLabel(role) {
    if (role === "admin") return "Админ";
    if (role === "manager") return "Менеджер";
    return "Клинер";
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

  function isAdminLinkedUser(user) {
    return Boolean(user && isAdminWorkspaceRole(user.role) && !isEmployeeLinkedUser(user));
  }

  function collectNonAssignableStaffIds(users = []) {
    const hiddenStaffIds = new Set();
    (Array.isArray(users) ? users : []).forEach((user) => {
      const staffId = normalizeString(user && user.staffId, 120);
      if (!staffId) return;
      if (!isEmployeeLinkedUser(user)) {
        hiddenStaffIds.add(staffId);
      }
    });
    return hiddenStaffIds;
  }

  function filterStaffSnapshotByHiddenStaffIds(staffSnapshot = {}, hiddenStaffIds = new Set()) {
    if (!(hiddenStaffIds instanceof Set) || hiddenStaffIds.size === 0) {
      return {
        ...staffSnapshot,
        staff: Array.isArray(staffSnapshot.staff) ? staffSnapshot.staff.slice() : [],
        assignments: Array.isArray(staffSnapshot.assignments) ? staffSnapshot.assignments.slice() : [],
      };
    }

    return {
      ...staffSnapshot,
      staff: Array.isArray(staffSnapshot.staff)
        ? staffSnapshot.staff.filter((record) => !hiddenStaffIds.has(normalizeString(record && record.id, 120)))
        : [],
      assignments: Array.isArray(staffSnapshot.assignments)
        ? staffSnapshot.assignments.map((record) => ({
            ...record,
            staffIds: Array.isArray(record && record.staffIds)
              ? record.staffIds.filter((staffId) => !hiddenStaffIds.has(normalizeString(staffId, 120)))
              : [],
          }))
        : [],
    };
  }

  function inferWorkspaceRoleValue(value) {
    const normalized = normalizeString(value, 80).toLowerCase();
    if (!normalized) return "";
    if (normalized === "admin" || normalized === "админ" || normalized === "administrator") return "admin";
    if (
      normalized === "manager" ||
      normalized === "менеджер" ||
      normalized.includes("manager") ||
      normalized.includes("lead")
    ) {
      return "manager";
    }
    if (normalized === "cleaner" || normalized === "клинер" || normalized.includes("clean")) {
      return "cleaner";
    }
    return "";
  }

  function getWorkspaceAccessContext(adminRuntime = {}) {
    const currentUserAccess =
      adminRuntime && adminRuntime.currentUserAccess
        ? adminRuntime.currentUserAccess
        : {};
    const role = normalizeString(currentUserAccess.role, 32).toLowerCase() || "admin";
    return {
      role,
      canEdit: currentUserAccess.canEdit !== false,
      canDelete: currentUserAccess.canDelete !== false,
      logoutPath: normalizeString(currentUserAccess.logoutPath, 200) || "/admin/logout",
      roleLabel: formatWorkspaceRoleLabel(role),
      roleTone: role === "admin" ? "success" : role === "manager" ? "outline" : "muted",
      unreadMessageCount: Math.max(
        0,
        Number.parseInt(String(adminRuntime && adminRuntime.unreadMessageCount ? adminRuntime.unreadMessageCount : 0), 10) || 0
      ),
      newQuoteCount: Math.max(
        0,
        Number.parseInt(String(adminRuntime && adminRuntime.newQuoteCount ? adminRuntime.newQuoteCount : 0), 10) || 0
      ),
      newLeadTaskCount: Math.max(
        0,
        Number.parseInt(String(adminRuntime && adminRuntime.newLeadTaskCount ? adminRuntime.newLeadTaskCount : 0), 10) || 0
      ),
    };
  }

  async function collectQuoteOpsManagerOptions(adminRuntime = {}, staffStore = null) {
    const usersStore = adminRuntime && adminRuntime.usersStore ? adminRuntime.usersStore : null;
    if (!usersStore || typeof usersStore.getSnapshot !== "function") return [];

    const [usersSnapshot, staffSnapshot] = await Promise.all([
      usersStore.getSnapshot(),
      staffStore && typeof staffStore.getSnapshot === "function"
        ? staffStore.getSnapshot()
        : Promise.resolve({ staff: [] }),
    ]);

    const staffNameById = new Map(
      (Array.isArray(staffSnapshot && staffSnapshot.staff) ? staffSnapshot.staff : [])
        .map((record) => [normalizeString(record && record.id, 120), normalizeString(record && record.name, 200)])
        .filter(([id, name]) => Boolean(id && name))
    );

    return (Array.isArray(usersSnapshot && usersSnapshot.users) ? usersSnapshot.users : [])
      .filter((user) => {
        const role = normalizeString(user && user.role, 32).toLowerCase();
        const status = normalizeString(user && user.status, 32).toLowerCase();
        return status === "active" && role === "manager";
      })
      .map((user) => {
        const id = normalizeString(user.id, 120);
        const email = normalizeString(user.email, 250).toLowerCase();
        const name = staffNameById.get(normalizeString(user.staffId, 120)) || email || "Менеджер";
        return { id, email, name };
      })
      .sort((left, right) => left.name.localeCompare(right.name, "ru"));
  }

  async function collectQuoteOpsTaskAssigneeOptions(adminRuntime = {}, staffStore = null) {
    const usersStore = adminRuntime && adminRuntime.usersStore ? adminRuntime.usersStore : null;
    if (!usersStore || typeof usersStore.getSnapshot !== "function") return [];

    const [usersSnapshot, staffSnapshot] = await Promise.all([
      usersStore.getSnapshot(),
      staffStore && typeof staffStore.getSnapshot === "function"
        ? staffStore.getSnapshot()
        : Promise.resolve({ staff: [] }),
    ]);

    const staffNameById = new Map(
      (Array.isArray(staffSnapshot && staffSnapshot.staff) ? staffSnapshot.staff : [])
        .map((record) => [normalizeString(record && record.id, 120), normalizeString(record && record.name, 200)])
        .filter(([id, name]) => Boolean(id && name))
    );
    const roleLabels = {
      admin: "админ",
      manager: "менеджер",
    };

    return (Array.isArray(usersSnapshot && usersSnapshot.users) ? usersSnapshot.users : [])
      .filter((user) => {
        const role = normalizeString(user && user.role, 32).toLowerCase();
        const status = normalizeString(user && user.status, 32).toLowerCase();
        return status === "active" && (role === "manager" || role === "admin");
      })
      .map((user) => {
        const id = normalizeString(user.id, 120);
        const email = normalizeString(user.email, 250).toLowerCase();
        const role = normalizeString(user.role, 32).toLowerCase();
        const name = staffNameById.get(normalizeString(user.staffId, 120)) || email || "Сотрудник";
        return {
          id,
          email,
          name,
          role,
          label: `${name} — ${roleLabels[role] || "сотрудник"}`,
        };
      })
      .sort((left, right) => left.name.localeCompare(right.name, "ru"));
  }

  return {
    formatWorkspaceRoleLabel,
    isAdminWorkspaceRole,
    isEmployeeLinkedUser,
    isAdminLinkedUser,
    collectNonAssignableStaffIds,
    filterStaffSnapshotByHiddenStaffIds,
    inferWorkspaceRoleValue,
    getWorkspaceAccessContext,
    collectQuoteOpsManagerOptions,
    collectQuoteOpsTaskAssigneeOptions,
  };
}

module.exports = {
  createWorkspaceHelpers,
};
