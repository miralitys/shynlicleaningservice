"use strict";

const crypto = require("node:crypto");
const fsp = require("node:fs/promises");
const path = require("node:path");

const STORE_VERSION = 1;
const STAFF_STATUS_VALUES = ["active", "inactive", "on_leave"];
const STAFF_STATUS_SET = new Set(STAFF_STATUS_VALUES);
const ASSIGNMENT_STATUS_VALUES = ["planned", "confirmed", "completed", "issue"];
const ASSIGNMENT_STATUS_SET = new Set(ASSIGNMENT_STATUS_VALUES);

function normalizeString(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeEmail(value) {
  return normalizeString(value, 200).toLowerCase();
}

function normalizeArray(values, maxItems = 8, maxLength = 120) {
  const items = Array.isArray(values) ? values : values ? [values] : [];
  const seen = new Set();
  const output = [];

  for (const item of items) {
    const normalized = normalizeString(item, maxLength);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(normalized);
    if (output.length >= maxItems) break;
  }

  return output;
}

function getSafeStaffStatus(value) {
  const normalized = normalizeString(value, 32).toLowerCase();
  return STAFF_STATUS_SET.has(normalized) ? normalized : "active";
}

function getSafeAssignmentStatus(value) {
  const normalized = normalizeString(value, 32).toLowerCase();
  return ASSIGNMENT_STATUS_SET.has(normalized) ? normalized : "planned";
}

function sanitizeStaffRecord(input = {}) {
  const createdAt = normalizeString(input.createdAt, 80) || new Date().toISOString();
  return {
    id: normalizeString(input.id, 120) || crypto.randomUUID(),
    name: normalizeString(input.name || input.fullName, 120),
    role: normalizeString(input.role, 80),
    phone: normalizeString(input.phone, 80),
    email: normalizeEmail(input.email),
    status: getSafeStaffStatus(input.status),
    notes: normalizeString(input.notes, 800),
    createdAt,
    updatedAt: normalizeString(input.updatedAt, 80) || createdAt,
  };
}

function sanitizeAssignmentRecord(input = {}) {
  const createdAt = normalizeString(input.createdAt, 80) || new Date().toISOString();
  return {
    entryId: normalizeString(input.entryId, 120),
    staffIds: normalizeArray(input.staffIds, 6, 120),
    scheduleDate: normalizeString(input.scheduleDate, 32),
    scheduleTime: normalizeString(input.scheduleTime, 32),
    status: getSafeAssignmentStatus(input.status),
    notes: normalizeString(input.notes, 800),
    createdAt,
    updatedAt: normalizeString(input.updatedAt, 80) || createdAt,
  };
}

function shouldKeepAssignmentRecord(record) {
  return Boolean(
    record.entryId &&
      (
        record.staffIds.length > 0 ||
        record.scheduleDate ||
        record.scheduleTime ||
        record.notes ||
        record.status !== "planned"
      )
  );
}

function sanitizeState(raw = {}) {
  const nextState = {
    version: STORE_VERSION,
    staff: Array.isArray(raw.staff) ? raw.staff.map((record) => sanitizeStaffRecord(record)).filter((record) => Boolean(record.name)) : [],
    assignments: Array.isArray(raw.assignments)
      ? raw.assignments
          .map((record) => sanitizeAssignmentRecord(record))
          .filter((record) => shouldKeepAssignmentRecord(record))
      : [],
  };

  nextState.staff.sort((left, right) => {
    if (left.status !== right.status) {
      if (left.status === "active") return -1;
      if (right.status === "active") return 1;
    }
    return left.name.localeCompare(right.name, "ru");
  });

  nextState.assignments.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  return nextState;
}

async function readState(filePath) {
  try {
    const raw = await fsp.readFile(filePath, "utf8");
    return sanitizeState(JSON.parse(raw));
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return sanitizeState({});
    }
    throw error;
  }
}

function cloneStaffRecord(record) {
  return { ...record };
}

function cloneAssignmentRecord(record) {
  return {
    ...record,
    staffIds: [...record.staffIds],
  };
}

function createAdminStaffStore(options = {}) {
  const filePath = path.resolve(
    options.filePath ||
      process.env.ADMIN_STAFF_STORE_PATH ||
      path.join(process.cwd(), "data", "admin-staff-store.json")
  );
  let statePromise = null;
  let writeQueue = Promise.resolve();

  async function ensureState() {
    if (!statePromise) {
      statePromise = readState(filePath);
    }
    return statePromise;
  }

  async function persistState(state) {
    await fsp.mkdir(path.dirname(filePath), { recursive: true });
    await fsp.writeFile(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  }

  function runSerialized(work) {
    const nextOperation = writeQueue.then(async () => {
      const state = await ensureState();
      const result = await work(state);
      await persistState(state);
      return result;
    });
    writeQueue = nextOperation.catch(() => {});
    return nextOperation;
  }

  return {
    filePath,
    async getSnapshot() {
      const state = await ensureState();
      return {
        staff: state.staff.map(cloneStaffRecord),
        assignments: state.assignments.map(cloneAssignmentRecord),
      };
    },
    async createStaff(input = {}) {
      return runSerialized(async (state) => {
        const record = sanitizeStaffRecord(input);
        if (!record.name) {
          throw new Error("STAFF_NAME_REQUIRED");
        }
        state.staff.push(record);
        state.staff = sanitizeState(state).staff;
        return cloneStaffRecord(record);
      });
    },
    async updateStaff(staffId, input = {}) {
      return runSerialized(async (state) => {
        const normalizedId = normalizeString(staffId, 120);
        const existing = state.staff.find((record) => record.id === normalizedId);
        if (!existing) {
          throw new Error("STAFF_NOT_FOUND");
        }
        const record = sanitizeStaffRecord({
          ...existing,
          ...input,
          id: existing.id,
          createdAt: existing.createdAt,
          updatedAt: new Date().toISOString(),
        });
        if (!record.name) {
          throw new Error("STAFF_NAME_REQUIRED");
        }
        Object.assign(existing, record);
        state.staff = sanitizeState(state).staff;
        return cloneStaffRecord(existing);
      });
    },
    async deleteStaff(staffId) {
      return runSerialized(async (state) => {
        const normalizedId = normalizeString(staffId, 120);
        const existing = state.staff.find((record) => record.id === normalizedId);
        if (!existing) {
          throw new Error("STAFF_NOT_FOUND");
        }
        state.staff = state.staff.filter((record) => record.id !== normalizedId);
        state.assignments = state.assignments
          .map((record) =>
            sanitizeAssignmentRecord({
              ...record,
              staffIds: record.staffIds.filter((candidateId) => candidateId !== normalizedId),
              updatedAt: new Date().toISOString(),
            })
          )
          .filter((record) => shouldKeepAssignmentRecord(record));
        return cloneStaffRecord(existing);
      });
    },
    async setAssignment(entryId, input = {}) {
      return runSerialized(async (state) => {
        const normalizedEntryId = normalizeString(entryId, 120);
        if (!normalizedEntryId) {
          throw new Error("ENTRY_ID_REQUIRED");
        }
        const existing = state.assignments.find((record) => record.entryId === normalizedEntryId);
        const record = sanitizeAssignmentRecord({
          ...existing,
          ...input,
          entryId: normalizedEntryId,
          createdAt: existing ? existing.createdAt : new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });

        if (!shouldKeepAssignmentRecord(record)) {
          state.assignments = state.assignments.filter((candidate) => candidate.entryId !== normalizedEntryId);
          return null;
        }

        if (existing) {
          Object.assign(existing, record);
          state.assignments = sanitizeState(state).assignments;
          return cloneAssignmentRecord(existing);
        }

        state.assignments.unshift(record);
        state.assignments = sanitizeState(state).assignments;
        return cloneAssignmentRecord(record);
      });
    },
    async clearAssignment(entryId) {
      return runSerialized(async (state) => {
        const normalizedEntryId = normalizeString(entryId, 120);
        const existing = state.assignments.find((record) => record.entryId === normalizedEntryId);
        if (!existing) return null;
        state.assignments = state.assignments.filter((record) => record.entryId !== normalizedEntryId);
        return cloneAssignmentRecord(existing);
      });
    },
  };
}

module.exports = {
  ASSIGNMENT_STATUS_VALUES,
  STAFF_STATUS_VALUES,
  createAdminStaffStore,
};
